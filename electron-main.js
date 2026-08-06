const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const XLSX = require('xlsx');

let mainWindow;
let db;
let SQL;
let hasStudentNameColumn = false;
let currentLibrary = 'primaire';
let currentDbPath = null;
let libraryCatalog = [];

const DEFAULT_LIBRARIES = [
  { key: 'primaire', name: 'Primaire', file: 'biblio-primaire.sqlite3' },
  { key: 'maternelle', name: 'Maternelle', file: 'biblio-maternelle.sqlite3' }
];

function slugifyLibraryKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bibliotheque';
}

function getLibraryByKey(key) {
  return libraryCatalog.find((item) => item.key === key) || null;
}

function isDefaultLibraryKey(key) {
  return DEFAULT_LIBRARIES.some((item) => item.key === key);
}

function buildLibraryCatalog(configLibraries) {
  const map = new Map();
  DEFAULT_LIBRARIES.forEach((item) => {
    map.set(item.key, { ...item });
  });
  if (Array.isArray(configLibraries)) {
    configLibraries.forEach((item) => {
      const key = slugifyLibraryKey(item && item.key ? item.key : item && item.name ? item.name : '');
      const name = String(item && item.name ? item.name : '').trim();
      const file = String(item && item.file ? item.file : '').trim();
      if (!key || !name || !file) return;
      map.set(key, { key, name, file });
    });
  }
  return Array.from(map.values());
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
function getConfigPath() {
  const dataDir = app.getPath('userData');
  ensureDir(dataDir);
  return path.join(dataDir, 'settings.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function saveConfig() {
  const existing = loadConfig();
  const payload = { ...existing, library: currentLibrary, libraries: libraryCatalog };
  fs.writeFileSync(getConfigPath(), JSON.stringify(payload, null, 2));
}

function enableForeignKeys() {
  db.run('PRAGMA foreign_keys = ON;');
}

/*
 * Chiffrement au repos des fichiers de base de donnees et des sauvegardes JSON.
 * Utilise safeStorage d'Electron (DPAPI sur Windows), qui chiffre avec une cle
 * liee au compte Windows de l'utilisateur, sans mot de passe supplementaire a
 * gerer et sans dependance native a compiler. Un en-tete magique distingue les
 * fichiers chiffres des fichiers en clair (bases existantes d'avant ce
 * chiffrement, ou fichiers externes importes) : ceux-ci restent lisibles tels
 * quels, et seront re-ecrits chiffres au prochain enregistrement.
 */
const ENC_MAGIC = Buffer.from('BRENC1\0', 'utf-8');

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (e) {
    return false;
  }
}

function encryptBuffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!isEncryptionAvailable()) return source;
  const encrypted = safeStorage.encryptString(source.toString('base64'));
  return Buffer.concat([ENC_MAGIC, encrypted]);
}

function decryptBuffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const isEncrypted = source.length >= ENC_MAGIC.length && source.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);
  if (!isEncrypted) return source;
  if (!isEncryptionAvailable()) {
    throw new Error('Le chiffrement n\'est pas disponible sur ce poste pour dechiffrer ce fichier.');
  }
  const payload = source.subarray(ENC_MAGIC.length);
  const decoded = safeStorage.decryptString(payload);
  return Buffer.from(decoded, 'base64');
}

function writeEncryptedFile(filePath, bytes) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, encryptBuffer(bytes));
  fs.renameSync(tmpPath, filePath);
}

function readEncryptedFile(filePath) {
  return decryptBuffer(fs.readFileSync(filePath));
}

function getDbPath(libraryKey = currentLibrary) {
  const dataDir = app.getPath('userData');
  ensureDir(dataDir);
  const fallback = DEFAULT_LIBRARIES[0];
  const entry = getLibraryByKey(libraryKey) || fallback;
  const fileName = entry.file;
  return path.join(dataDir, fileName);
}

function migrateLegacyDb() {
  const dataDir = app.getPath('userData');
  ensureDir(dataDir);
  const legacyPath = path.join(dataDir, 'biblio.sqlite3');
  const primaryPath = path.join(dataDir, DEFAULT_LIBRARIES[0].file);
  if (!fs.existsSync(legacyPath)) return;
  const legacySize = fs.statSync(legacyPath).size;
  if (!fs.existsSync(primaryPath)) {
    fs.copyFileSync(legacyPath, primaryPath);
    return;
  }
  const primarySize = fs.statSync(primaryPath).size;
  if (primarySize === 0 || primarySize < legacySize) {
    const backupPath = path.join(dataDir, 'biblio-primaire.backup.sqlite3');
    fs.copyFileSync(primaryPath, backupPath);
    fs.copyFileSync(legacyPath, primaryPath);
  }
}

async function initDb() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });

  migrateLegacyDb();
  const cfg = loadConfig();
  libraryCatalog = buildLibraryCatalog(cfg.libraries);
  const savedLibrary = cfg.library;
  if (savedLibrary && getLibraryByKey(savedLibrary)) {
    currentLibrary = savedLibrary;
  }

  openDbForLibrary(currentLibrary);
}

/*
 * Migrations de schema versionnees. Chaque entree est appliquee une seule fois,
 * dans l'ordre, en s'appuyant sur PRAGMA user_version (entier stocke nativement
 * dans le fichier SQLite). Toujours ajouter de nouvelles migrations a la fin du
 * tableau, jamais modifier ou reordonner les entrees existantes.
 */
const MIGRATIONS = [
  // v1 : schema de base
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS school_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_year_id INTEGER,
        name TEXT NOT NULL,
        teacher_name TEXT,
        level TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(school_year_id) REFERENCES school_years(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn TEXT,
        title TEXT NOT NULL,
        author TEXT,
        year INTEGER,
        copies INTEGER DEFAULT 1,
        numero TEXT,
        location TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER,
        last_name TEXT,
        first_name TEXT,
        birth_year INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS student_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        class_id INTEGER,
        school_year_id INTEGER,
        start_date TEXT NOT NULL,
        end_date TEXT,
        FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE SET NULL,
        FOREIGN KEY(school_year_id) REFERENCES school_years(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        loan_date TEXT NOT NULL,
        due_date TEXT,
        return_date TEXT,
        FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
        FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
      );
    `);
  },
  // v2 : colonnes de compatibilite ajoutees apres coup sur d'anciennes bases
  (database) => {
    const tryAlter = (sql) => { try { database.exec(sql); } catch (e) { /* colonne deja presente */ } };
    tryAlter('ALTER TABLE students ADD COLUMN school_year TEXT');
    tryAlter('ALTER TABLE students ADD COLUMN class TEXT');
    tryAlter('ALTER TABLE students ADD COLUMN class_id INTEGER');
    tryAlter('ALTER TABLE students ADD COLUMN last_name TEXT');
    tryAlter('ALTER TABLE students ADD COLUMN first_name TEXT');
    tryAlter('ALTER TABLE students ADD COLUMN birth_year INTEGER');
    tryAlter('ALTER TABLE books ADD COLUMN numero TEXT');
  }
];

function getSchemaVersion() {
  const result = db.exec('PRAGMA user_version');
  if (result.length && result[0].values.length) {
    return Number(result[0].values[0][0]) || 0;
  }
  return 0;
}

function setSchemaVersion(v) {
  db.run(`PRAGMA user_version = ${Number(v)}`);
}

function runMigrations() {
  const current = getSchemaVersion();
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    MIGRATIONS[v](db);
    setSchemaVersion(v + 1);
  }
}

function ensureSchema() {
  runMigrations();
  migrateStudentsToClasses();
  hasStudentNameColumn = columnExists('students', 'name');
}

function openDbForLibrary(libraryKey) {
  if (!getLibraryByKey(libraryKey)) {
    throw new Error(`Bibliotheque inconnue: ${libraryKey}`);
  }
  const nextLibrary = libraryKey;
  currentLibrary = nextLibrary;
  const dbPath = getDbPath(currentLibrary);
  currentDbPath = dbPath;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = readEncryptedFile(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
  }
  enableForeignKeys();

  ensureSchema();
  saveDb();
  saveConfig();
  restoreFromLegacyOrBackup();
}

function listLibraries() {
  return libraryCatalog.map((item) => ({ key: item.key, name: item.name }));
}

function createLibrary(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw new Error('Nom de bibliotheque requis.');
  }
  const existingByName = libraryCatalog.find((item) => item.name.toLowerCase() === cleanName.toLowerCase());
  if (existingByName) {
    return { key: existingByName.key, name: existingByName.name };
  }

  const baseKey = slugifyLibraryKey(cleanName);
  let key = baseKey;
  let index = 2;
  while (getLibraryByKey(key)) {
    key = `${baseKey}-${index}`;
    index += 1;
  }
  const file = `biblio-${key}.sqlite3`;
  libraryCatalog.push({ key, name: cleanName, file });
  saveConfig();
  return { key, name: cleanName };
}

function renameLibrary(libraryKey, nextName) {
  const entry = getLibraryByKey(libraryKey);
  if (!entry) {
    throw new Error('Bibliotheque inconnue.');
  }
  if (isDefaultLibraryKey(libraryKey)) {
    throw new Error('Primaire et Maternelle ne peuvent pas etre renommees.');
  }
  const cleanName = String(nextName || '').trim();
  if (!cleanName) {
    throw new Error('Nom de bibliotheque requis.');
  }
  const duplicate = libraryCatalog.find((item) => item.key !== libraryKey && item.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) {
    throw new Error('Une bibliotheque avec ce nom existe deja.');
  }
  entry.name = cleanName;
  saveConfig();
  return { key: entry.key, name: entry.name };
}

function deleteLibrary(libraryKey) {
  const entry = getLibraryByKey(libraryKey);
  if (!entry) {
    throw new Error('Bibliotheque inconnue.');
  }
  if (isDefaultLibraryKey(libraryKey)) {
    throw new Error('Primaire et Maternelle ne peuvent pas etre supprimees.');
  }

  const dbPath = getDbPath(libraryKey);
  libraryCatalog = libraryCatalog.filter((item) => item.key !== libraryKey);

  if (currentLibrary === libraryKey) {
    openDbForLibrary(DEFAULT_LIBRARIES[0].key);
  } else {
    saveConfig();
  }

  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  } catch (e) {
    // ignore file delete errors
  }

  return { active: currentLibrary, libraries: listLibraries() };
}

function importDatabaseBuffer(buffer) {
  const dbPath = currentDbPath || getDbPath(currentLibrary);
  if (fs.existsSync(dbPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = dbPath.replace('.sqlite3', `.backup-${stamp}.sqlite3`);
    fs.copyFileSync(dbPath, backupPath);
  }
  writeEncryptedFile(dbPath, Buffer.from(buffer));
  const fileBuffer = readEncryptedFile(dbPath);
  db = new SQL.Database(new Uint8Array(fileBuffer));
  enableForeignKeys();
  ensureSchema();
  migrateStudentsToClasses();
  hasStudentNameColumn = columnExists('students', 'name');
  saveDb();
  backupJson();
}

function importFileAtPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const datasets = ['books', 'students', 'classes', 'school_years', 'loans', 'student_history'];
  if (ext === '.sqlite3' || ext === '.db') {
    const buffer = fs.readFileSync(filePath);
    importDatabaseBuffer(buffer);
    return { type: 'db' };
  }
  if (ext === '.json') {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    importMerge(data, datasets);
    return { type: 'json' };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parsed = {};
    workbook.SheetNames.forEach((name) => {
      const key = normalizeSheetName(name);
      const sheet = workbook.Sheets[name];
      parsed[key] = XLSX.utils.sheet_to_json(sheet, { defval: null });
    });
    importMerge(parsed, datasets);
    return { type: 'xlsx' };
  }
  throw new Error('Format non supporte.');
}

function columnExists(table, column) {
  const cols = all(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function saveDb() {
  const data = db.export();
  const dbPath = currentDbPath || getDbPath(currentLibrary);
  writeEncryptedFile(dbPath, Buffer.from(data));
}

function countRows(table) {
  const row = get(`SELECT COUNT(*) AS c FROM ${table}`);
  return row ? Number(row.c || 0) : 0;
}

function isCurrentDbEmpty() {
  return countRows('books') === 0
    && countRows('students') === 0
    && countRows('classes') === 0
    && countRows('school_years') === 0
    && countRows('loans') === 0;
}

function legacyDbHasData(legacyPath) {
  try {
    const buf = fs.readFileSync(legacyPath);
    const legacyDb = new SQL.Database(new Uint8Array(buf));
    const stmt = legacyDb.prepare('SELECT COUNT(*) AS c FROM books');
    let count = 0;
    if (stmt.step()) {
      count = Number(stmt.getAsObject().c || 0);
    }
    stmt.free();
    return count > 0;
  } catch (e) {
    return false;
  }
}

function getLatestBackupPath() {
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(backupsDir)) return null;
  const entries = fs.readdirSync(backupsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({
      name,
      fullPath: path.join(backupsDir, name),
      mtime: fs.statSync(path.join(backupsDir, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return entries[0] ? entries[0].fullPath : null;
}

function restoreFromLegacyOrBackup() {
  if (currentLibrary !== 'primaire') return;
  if (!isCurrentDbEmpty()) return;
  const dataDir = app.getPath('userData');
  const legacyPath = path.join(dataDir, 'biblio.sqlite3');
  const primaryPath = getDbPath('primaire');
  if (fs.existsSync(legacyPath) && legacyDbHasData(legacyPath)) {
    const backupPath = path.join(dataDir, 'biblio-primaire.backup.sqlite3');
    if (fs.existsSync(primaryPath)) fs.copyFileSync(primaryPath, backupPath);
    fs.copyFileSync(legacyPath, primaryPath);
    const buf = readEncryptedFile(primaryPath);
    db = new SQL.Database(new Uint8Array(buf));
    enableForeignKeys();
    ensureSchema();
    migrateStudentsToClasses();
    hasStudentNameColumn = columnExists('students', 'name');
    saveDb();
    return;
  }

  const latestBackup = getLatestBackupPath();
  if (latestBackup) {
    try {
      const raw = readEncryptedFile(latestBackup).toString('utf-8');
      const data = JSON.parse(raw);
      importMerge(data, [
        'books',
        'students',
        'classes',
        'school_years',
        'loans',
        'student_history'
      ]);
    } catch (e) {
      // ignore backup restore errors
    }
  }
}

function getDbStats() {
  return {
    library: currentLibrary,
    dbPath: currentDbPath || getDbPath(currentLibrary),
    counts: {
      books: countRows('books'),
      students: countRows('students'),
      classes: countRows('classes'),
      school_years: countRows('school_years'),
      loans: countRows('loans')
    }
  };
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0];
}

function getStatistics() {
  const now = new Date().toISOString();
  const topBooks = all(`
    SELECT b.id, b.title, b.author, COUNT(l.id) AS loan_count
    FROM loans l
    JOIN books b ON b.id = l.book_id
    GROUP BY b.id
    ORDER BY loan_count DESC, b.title COLLATE NOCASE
    LIMIT 5
  `);
  const topClasses = all(`
    SELECT c.id, c.name, c.teacher_name, y.name AS school_year, COUNT(l.id) AS loan_count
    FROM loans l
    JOIN students s ON s.id = l.student_id
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN school_years y ON y.id = c.school_year_id
    GROUP BY c.id
    ORDER BY loan_count DESC, c.name COLLATE NOCASE
    LIMIT 5
  `);
  const totals = get('SELECT COUNT(*) AS c FROM loans');
  const active = get('SELECT COUNT(*) AS c FROM loans WHERE return_date IS NULL');
  const overdue = get(
    'SELECT COUNT(*) AS c FROM loans WHERE return_date IS NULL AND due_date IS NOT NULL AND due_date < ?',
    [now]
  );
  const neverBorrowed = get(`
    SELECT COUNT(*) AS c FROM books b
    WHERE NOT EXISTS (SELECT 1 FROM loans l WHERE l.book_id = b.id)
  `);

  return {
    topBooks,
    topClasses,
    totalLoans: totals ? totals.c : 0,
    activeLoans: active ? active.c : 0,
    overdueLoans: overdue ? overdue.c : 0,
    booksNeverBorrowed: neverBorrowed ? neverBorrowed.c : 0,
    booksTotal: countRows('books'),
    studentsTotal: countRows('students')
  };
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {}
  stmt.free();
}

function insertAndGetId(sql, params = []) {
  run(sql, params);
  const row = get('SELECT last_insert_rowid() AS id');
  return row ? row.id : null;
}

function getSchoolYearIdForClass(classId) {
  if (!classId) return null;
  const row = get('SELECT school_year_id FROM classes WHERE id = ?', [classId]);
  return row ? row.school_year_id : null;
}

function closeOpenHistory(studentId) {
  const now = new Date().toISOString();
  run('UPDATE student_history SET end_date = ? WHERE student_id = ? AND end_date IS NULL', [now, studentId]);
}

function insertStudentHistory(studentId, classId) {
  if (!studentId || !classId) return;
  const yearId = getSchoolYearIdForClass(classId);
  const now = new Date().toISOString();
  run(
    'INSERT INTO student_history (student_id, class_id, school_year_id, start_date, end_date) VALUES (?, ?, ?, ?, NULL)',
    [studentId, classId, yearId, now]
  );
}

function updateStudentHistoryOnClassChange(studentId, newClassId) {
  closeOpenHistory(studentId);
  if (newClassId) {
    insertStudentHistory(studentId, newClassId);
  }
}

function migrateStudentsToClasses() {
  const students = all('SELECT * FROM students WHERE class_id IS NULL');
  if (!students.length) return;

  const yearMap = new Map();
  const classMap = new Map();

  students.forEach((s) => {
    if (!s.class) return;
    const yearName = s.school_year || 'Sans annee';
    let yearId = yearMap.get(yearName);
    if (!yearId) {
      const existing = get('SELECT id FROM school_years WHERE name = ?', [yearName]);
      yearId = existing ? existing.id : insertAndGetId(
        'INSERT INTO school_years (name, created_at) VALUES (?, ?)',
        [yearName, new Date().toISOString()]
      );
      yearMap.set(yearName, yearId);
    }

    const classKey = `${yearId}:${s.class}`;
    let classId = classMap.get(classKey);
    if (!classId) {
      const existingClass = get('SELECT id FROM classes WHERE school_year_id = ? AND name = ?', [yearId, s.class]);
      classId = existingClass ? existingClass.id : insertAndGetId(
        'INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?)',
        [yearId, s.class, null, null, new Date().toISOString()]
      );
      classMap.set(classKey, classId);
    }

    run('UPDATE students SET class_id = ? WHERE id = ?', [classId, s.id]);
  });
}

function backupJson() {
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  ensureDir(backupsDir);

  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      version: '0.1.0'
    },
    books: all('SELECT * FROM books'),
    school_years: all('SELECT * FROM school_years'),
    classes: all('SELECT * FROM classes'),
    students: all('SELECT * FROM students'),
    student_history: all('SELECT * FROM student_history'),
    loans: all('SELECT * FROM loans')
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(backupsDir, `backup-${stamp}.json`);
  fs.writeFileSync(outPath, encryptBuffer(Buffer.from(JSON.stringify(payload, null, 2), 'utf-8')));
  pruneOldBackups(backupsDir);
}

const BACKUP_RETENTION_COUNT = 30;

function pruneOldBackups(backupsDir, keep = BACKUP_RETENTION_COUNT) {
  try {
    const entries = fs.readdirSync(backupsDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const fullPath = path.join(backupsDir, name);
        return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    entries.slice(keep).forEach((entry) => {
      try { fs.unlinkSync(entry.fullPath); } catch (e) { /* ignore prune errors */ }
    });
  } catch (e) {
    // ignore prune errors
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function isAuthSet() {
  const cfg = loadConfig();
  return !!(cfg.auth && cfg.auth.hash && cfg.auth.salt);
}

function setAuthPassword(password) {
  const clean = String(password || '');
  const cfg = loadConfig();
  if (!clean) {
    delete cfg.auth;
  } else {
    const salt = crypto.randomBytes(16).toString('hex');
    cfg.auth = { salt, hash: hashPassword(clean, salt) };
  }
  cfg.library = currentLibrary;
  cfg.libraries = libraryCatalog;
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}

function verifyAuthPassword(password) {
  const cfg = loadConfig();
  if (!cfg.auth || !cfg.auth.hash || !cfg.auth.salt) return true;
  const attempt = Buffer.from(hashPassword(password, cfg.auth.salt));
  const expected = Buffer.from(cfg.auth.hash);
  if (attempt.length !== expected.length) return false;
  return crypto.timingSafeEqual(attempt, expected);
}

function logStartupError(err) {
  try {
    const dataDir = app.getPath('userData');
    ensureDir(dataDir);
    const logPath = path.join(dataDir, 'error.log');
    const line = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(logPath, line);
  } catch (e) {
    // ignore logging errors
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Biblio-rians - Bibliotheque scolaire'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  Menu.setApplicationMenu(null);
}

function listBooks() {
  return all(`
    SELECT b.*, 
      (SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.return_date IS NULL) AS on_loan
    FROM books b
    ORDER BY b.title COLLATE NOCASE
  `);
}

function listClassesWithYear() {
  return all(`
    SELECT c.*, y.name AS school_year
    FROM classes c
    LEFT JOIN school_years y ON y.id = c.school_year_id
    ORDER BY y.name DESC, c.name COLLATE NOCASE
  `);
}

function listStudentHistoryAll() {
  return all(`
    SELECT h.*, c.name AS class_name, c.teacher_name, c.level,
      y.name AS school_year,
      TRIM(COALESCE(s.last_name, '') || ' ' || COALESCE(s.first_name, '')) AS student_name
    FROM student_history h
    LEFT JOIN classes c ON c.id = h.class_id
    LEFT JOIN school_years y ON y.id = h.school_year_id
    LEFT JOIN students s ON s.id = h.student_id
    ORDER BY h.start_date DESC
  `);
}

function pickFields(rows, fields) {
  if (!fields || !fields.length) return rows;
  return rows.map((row) => {
    const out = {};
    fields.forEach((field) => {
      out[field] = row[field] !== undefined ? row[field] : null;
    });
    return out;
  });
}

function buildExportData(options) {
  const datasets = options.datasets || [];
  const fields = options.fields || {};
  const payload = {
    meta: { generated_at: new Date().toISOString(), version: '0.1.0' }
  };

  if (datasets.includes('books')) {
    const rows = listBooks().map((b) => ({
      ...b,
      available: Math.max(0, Number(b.copies || 0) - Number(b.on_loan || 0))
    }));
    payload.books = pickFields(rows, fields.books);
  }
  if (datasets.includes('students')) {
    const rows = listStudents().map((s) => ({
      ...s,
      student_name: `${s.last_name || ''} ${s.first_name || ''}`.trim()
    }));
    payload.students = pickFields(rows, fields.students);
  }
  if (datasets.includes('classes')) {
    const rows = listClassesWithYear();
    payload.classes = pickFields(rows, fields.classes);
  }
  if (datasets.includes('school_years')) {
    const rows = all('SELECT * FROM school_years ORDER BY name DESC');
    payload.school_years = pickFields(rows, fields.school_years);
  }
  if (datasets.includes('loans')) {
    const rows = listLoansAll();
    payload.loans = pickFields(rows, fields.loans);
  }
  if (datasets.includes('student_history')) {
    const rows = listStudentHistoryAll();
    payload.student_history = pickFields(rows, fields.student_history);
  }

  return payload;
}

function normalizeSheetName(name) {
  const key = String(name || '').toLowerCase().replace(/\s+/g, '_');
  if (key.includes('annee')) return 'school_years';
  if (key.includes('historique')) return 'student_history';
  if (key.includes('emprunt')) return 'loans';
  if (key.includes('eleve')) return 'students';
  if (key.includes('classe')) return 'classes';
  if (key.includes('livre')) return 'books';
  return key;
}

function getOrCreateSchoolYear(name) {
  const clean = (name || '').trim();
  if (!clean) return null;
  const existing = get('SELECT id FROM school_years WHERE name = ?', [clean]);
  if (existing) return existing.id;
  return insertAndGetId(
    'INSERT INTO school_years (name, created_at) VALUES (?, ?)',
    [clean, new Date().toISOString()]
  );
}

function getOrCreateClass(row) {
  const name = (row.name || row.class_name || row.class || '').trim();
  if (!name) return null;
  const yearId = row.school_year_id
    || (row.school_year ? getOrCreateSchoolYear(row.school_year) : null);
  const existing = get(
    'SELECT id FROM classes WHERE name = ? AND school_year_id IS ?',
    [name, yearId]
  );
  if (existing) return existing.id;
  return insertAndGetId(
    'INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?)',
    [yearId || null, name, row.teacher_name || null, row.level || null, new Date().toISOString()]
  );
}

function findBookId(row) {
  if (row.book_id) {
    const existing = get('SELECT id FROM books WHERE id = ?', [row.book_id]);
    if (existing) return existing.id;
  }
  const isbn = (row.isbn || '').trim();
  if (isbn) {
    const existing = get('SELECT id FROM books WHERE isbn = ?', [isbn]);
    if (existing) return existing.id;
  }
  const title = (row.title || row.book_title || '').trim();
  if (title) {
    const author = (row.author || '').trim();
    const year = row.year || null;
    const existing = get(
      'SELECT id FROM books WHERE title = ? AND COALESCE(author, "") = ? AND COALESCE(year, 0) = COALESCE(?, 0)',
      [title, author, year]
    );
    if (existing) return existing.id;
  }
  return null;
}

function findStudentId(row) {
  if (row.student_id) {
    const existing = get('SELECT id FROM students WHERE id = ?', [row.student_id]);
    if (existing) return existing.id;
  }
  const name = (row.student_name || '').trim();
  let lastName = (row.last_name || '').trim();
  let firstName = (row.first_name || '').trim();
  if (!lastName && name) {
    const parts = name.split(' ').filter(Boolean);
    lastName = parts.shift() || '';
    firstName = parts.join(' ');
  }
  const classId = row.class_id || (row.class_name ? getOrCreateClass(row) : null);
  if (!lastName && !firstName) return null;
  const existing = get(
    'SELECT id FROM students WHERE COALESCE(last_name, "") = ? AND COALESCE(first_name, "") = ? AND COALESCE(class_id, 0) = COALESCE(?, 0)',
    [lastName, firstName, classId]
  );
  if (existing) return existing.id;
  return insertAndGetId(
    'INSERT INTO students (class_id, last_name, first_name, birth_year, created_at) VALUES (?, ?, ?, ?, ?)',
    [classId || null, lastName || null, firstName || null, row.birth_year || null, new Date().toISOString()]
  );
}

function importMerge(data, datasets) {
  const now = new Date().toISOString();

  if (datasets.includes('school_years')) {
    (data.school_years || []).forEach((y) => {
      getOrCreateSchoolYear(y.name);
    });
  }

  if (datasets.includes('classes')) {
    (data.classes || []).forEach((c) => {
      getOrCreateClass(c);
    });
  }

  if (datasets.includes('books')) {
    (data.books || []).forEach((b) => {
      if (findBookId(b)) return;
      run(
        'INSERT INTO books (isbn, title, author, year, copies, numero, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [b.isbn || null, b.title || null, b.author || null, b.year || null, b.copies || 1, b.numero || null, b.location || null, b.created_at || now]
      );
    });
  }

  if (datasets.includes('students')) {
    (data.students || []).forEach((s) => {
      const classId = s.class_id || (s.class_name ? getOrCreateClass(s) : null);
      const lastName = s.last_name || null;
      const firstName = s.first_name || null;
      const existing = get(
        'SELECT id FROM students WHERE COALESCE(last_name, "") = ? AND COALESCE(first_name, "") = ? AND COALESCE(class_id, 0) = COALESCE(?, 0)',
        [lastName || '', firstName || '', classId]
      );
      if (existing) return;
      run(
        'INSERT INTO students (class_id, last_name, first_name, birth_year, created_at) VALUES (?, ?, ?, ?, ?)',
        [classId || null, lastName, firstName, s.birth_year || null, s.created_at || now]
      );
    });
  }

  if (datasets.includes('student_history')) {
    (data.student_history || []).forEach((h) => {
      const studentId = findStudentId(h);
      const classId = h.class_id || (h.class_name ? getOrCreateClass(h) : null);
      if (!studentId) return;
      const existing = get(
        'SELECT id FROM student_history WHERE student_id = ? AND COALESCE(class_id, 0) = COALESCE(?, 0) AND start_date = ?',
        [studentId, classId, h.start_date || '']
      );
      if (existing) return;
      run(
        'INSERT INTO student_history (student_id, class_id, school_year_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
        [
          studentId,
          classId || null,
          h.school_year_id || (h.school_year ? getOrCreateSchoolYear(h.school_year) : null),
          h.start_date || now,
          h.end_date || null
        ]
      );
    });
  }

  if (datasets.includes('loans')) {
    (data.loans || []).forEach((l) => {
      const bookId = findBookId(l);
      const studentId = findStudentId(l);
      if (!bookId || !studentId) return;
      const existing = get(
        'SELECT id FROM loans WHERE book_id = ? AND student_id = ? AND loan_date = ?',
        [bookId, studentId, l.loan_date || '']
      );
      if (existing) return;
      run(
        'INSERT INTO loans (book_id, student_id, loan_date, due_date, return_date) VALUES (?, ?, ?, ?, ?)',
        [bookId, studentId, l.loan_date || now, l.due_date || null, l.return_date || null]
      );
    });
  }

  saveDb();
  backupJson();
}

function listStudents() {
  return all(`
    SELECT s.*, c.name AS class_name, c.teacher_name, c.level,
      y.id AS school_year_id, y.name AS school_year
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN school_years y ON y.id = c.school_year_id
    ORDER BY y.name DESC, c.name COLLATE NOCASE, last_name COLLATE NOCASE, first_name COLLATE NOCASE
  `);
}

function listLoansAll() {
  return all(`
    SELECT l.*, b.title AS book_title,
      TRIM(COALESCE(s.last_name, '') || ' ' || COALESCE(s.first_name, '')) AS student_name
    FROM loans l
    JOIN books b ON b.id = l.book_id
    JOIN students s ON s.id = l.student_id
    ORDER BY l.loan_date DESC
  `);
}

function listLoansActive() {
  return all(`
    SELECT l.*, b.title AS book_title,
      TRIM(COALESCE(s.last_name, '') || ' ' || COALESCE(s.first_name, '')) AS student_name
    FROM loans l
    JOIN books b ON b.id = l.book_id
    JOIN students s ON s.id = l.student_id
    WHERE l.return_date IS NULL
    ORDER BY l.loan_date DESC
  `);
}

function normalizeStudentPayload(payload) {
  let lastName = (payload.last_name || '').trim();
  let firstName = (payload.first_name || '').trim();
  let classId = payload.class_id || null;

  if (!classId && payload.class && payload.school_year) {
    const year = get('SELECT id FROM school_years WHERE name = ?', [payload.school_year]);
    if (year) {
      const cls = get('SELECT id FROM classes WHERE school_year_id = ? AND name = ?', [year.id, payload.class]);
      classId = cls ? cls.id : null;
    }
  }

  return {
    class_id: classId,
    last_name: lastName || null,
    first_name: firstName || null,
    birth_year: payload.birth_year || null
  };
}

function getAvailableCopies(bookId) {
  const book = get('SELECT copies FROM books WHERE id = ?', [bookId]);
  if (!book) return 0;
  const onLoan = get('SELECT COUNT(*) AS c FROM loans WHERE book_id = ? AND return_date IS NULL', [bookId]);
  return book.copies - onLoan.c;
}

function normalizeIsbn(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^0-9Xx]/g, '').toUpperCase();
}

const ISBN_LOOKUP_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url, timeoutMs = ISBN_LOOKUP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function lookupIsbn(isbn) {
  const clean = normalizeIsbn(isbn);
  if (!clean) return null;

  // Open Library
  try {
    const res = await fetchWithTimeout(`https://openlibrary.org/isbn/${clean}.json`);
    if (res.ok) {
      const data = await res.json();
      let author = '';
      if (data.authors && data.authors[0] && data.authors[0].key) {
        const aRes = await fetchWithTimeout(`https://openlibrary.org${data.authors[0].key}.json`);
        if (aRes.ok) {
          const aData = await aRes.json();
          author = aData.name || '';
        }
      }
      return {
        isbn: clean,
        title: data.title || '',
        author,
        year: data.publish_date ? parseInt(String(data.publish_date).match(/\d{4}/)?.[0], 10) || null : null,
        coverUrl: `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg`
      };
    }
  } catch (e) {
    // ignore and fallback
  }

  // BnF SRU fallback
  try {
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=isbn=${clean}&maximumRecords=1&recordSchema=dc`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const xml = await res.text();
      const titleMatch = xml.match(/<dc:title>([^<]+)<\/dc:title>/i);
      const creatorMatch = xml.match(/<dc:creator>([^<]+)<\/dc:creator>/i);
      const dateMatch = xml.match(/<dc:date>([^<]+)<\/dc:date>/i);
      const year = dateMatch ? parseInt(String(dateMatch[1]).match(/\d{4}/)?.[0], 10) || null : null;
      if (titleMatch) {
        return {
          isbn: clean,
          title: titleMatch[1] || '',
          author: creatorMatch ? creatorMatch[1] : '',
          year,
          coverUrl: ''
        };
      }
    }
  } catch (e) {
    // ignore
  }

  // Google Books fallback
  try {
    const res = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
    if (res.ok) {
      const data = await res.json();
      const item = data.items && data.items[0];
      if (item && item.volumeInfo) {
        const v = item.volumeInfo;
        const year = v.publishedDate ? parseInt(String(v.publishedDate).match(/\d{4}/)?.[0], 10) || null : null;
        return {
          isbn: clean,
          title: v.title || '',
          author: (v.authors && v.authors.join(', ')) || '',
          year,
          coverUrl: (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || ''
        };
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}

function setupIpc() {
  ipcMain.handle('auth:isSet', () => isAuthSet());
  ipcMain.handle('auth:set', (_e, password) => {
    setAuthPassword(password);
    return true;
  });
  ipcMain.handle('auth:verify', (_e, password) => verifyAuthPassword(password));

  ipcMain.handle('library:get', () => currentLibrary);
  ipcMain.handle('library:list', () => listLibraries());
  ipcMain.handle('library:create', (_e, name) => createLibrary(name));
  ipcMain.handle('library:rename', (_e, libraryKey, nextName) => renameLibrary(libraryKey, nextName));
  ipcMain.handle('library:delete', (_e, libraryKey) => deleteLibrary(libraryKey));
  ipcMain.handle('library:info', () => getDbStats());
  ipcMain.handle('stats:get', () => getStatistics());
  ipcMain.handle('library:set', (_e, libraryKey) => {
    if (!getLibraryByKey(libraryKey)) {
      throw new Error('Bibliotheque inconnue.');
    }
    openDbForLibrary(libraryKey);
    return currentLibrary;
  });
  ipcMain.handle('books:list', () => listBooks());
  ipcMain.handle('books:add', (_e, payload) => {
    const now = new Date().toISOString();
    run(`
      INSERT INTO books (isbn, title, author, year, copies, numero, location, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [payload.isbn || null, payload.title, payload.author || null, payload.year || null, payload.copies || 1, payload.numero || null, payload.location || null, now]);
    saveDb();
    backupJson();
    return listBooks();
  });
  ipcMain.handle('books:update', (_e, payload) => {
    run(`
      UPDATE books
      SET isbn = ?, title = ?, author = ?, year = ?, copies = ?, numero = ?, location = ?
      WHERE id = ?
    `, [payload.isbn || null, payload.title, payload.author || null, payload.year || null, payload.copies || 1, payload.numero || null, payload.location || null, payload.id]);
    saveDb();
    backupJson();
    return listBooks();
  });
  ipcMain.handle('books:delete', (_e, id) => {
    const activeLoan = get('SELECT COUNT(*) AS c FROM loans WHERE book_id = ? AND return_date IS NULL', [id]);
    if (activeLoan && activeLoan.c > 0) {
      throw new Error('Impossible de supprimer ce livre : un ou plusieurs exemplaires sont actuellement empruntes. Enregistrez d\'abord leur retour.');
    }
    run('DELETE FROM books WHERE id = ?', [id]);
    saveDb();
    backupJson();
    return listBooks();
  });
  ipcMain.handle('books:lookup', async (_e, isbn) => {
    return lookupIsbn(isbn);
  });

  ipcMain.handle('students:list', () => listStudents());
  ipcMain.handle('students:add', (_e, payload) => {
    const now = new Date().toISOString();
    const data = normalizeStudentPayload(payload);
    const fullName = `${data.last_name || ''} ${data.first_name || ''}`.trim();
    const studentId = hasStudentNameColumn
      ? insertAndGetId(
          'INSERT INTO students (class_id, last_name, first_name, birth_year, created_at, name) VALUES (?, ?, ?, ?, ?, ?)',
          [data.class_id, data.last_name, data.first_name, data.birth_year, now, fullName]
        )
      : insertAndGetId(
          'INSERT INTO students (class_id, last_name, first_name, birth_year, created_at) VALUES (?, ?, ?, ?, ?)',
          [data.class_id, data.last_name, data.first_name, data.birth_year, now]
        );
    insertStudentHistory(studentId, data.class_id);
    saveDb();
    backupJson();
    return listStudents();
  });
  ipcMain.handle('students:update', (_e, payload) => {
    const data = normalizeStudentPayload(payload);
    const fullName = `${data.last_name || ''} ${data.first_name || ''}`.trim();
    const before = get('SELECT class_id FROM students WHERE id = ?', [payload.id]);
    if (hasStudentNameColumn) {
      run(
        'UPDATE students SET class_id = ?, last_name = ?, first_name = ?, birth_year = ?, name = ? WHERE id = ?',
        [data.class_id, data.last_name, data.first_name, data.birth_year, fullName, payload.id]
      );
    } else {
      run(
        'UPDATE students SET class_id = ?, last_name = ?, first_name = ?, birth_year = ? WHERE id = ?',
        [data.class_id, data.last_name, data.first_name, data.birth_year, payload.id]
      );
    }
    if (before && before.class_id !== data.class_id) {
      updateStudentHistoryOnClassChange(payload.id, data.class_id);
    }
    saveDb();
    backupJson();
    return listStudents();
  });
    ipcMain.handle('years:list', () => all('SELECT * FROM school_years ORDER BY name DESC'));
    ipcMain.handle('years:add', (_e, payload) => {
      const now = new Date().toISOString();
      insertAndGetId('INSERT INTO school_years (name, created_at) VALUES (?, ?)', [payload.name, now]);
      saveDb();
      backupJson();
      return all('SELECT * FROM school_years ORDER BY name DESC');
    });
    ipcMain.handle('years:update', (_e, payload) => {
      run('UPDATE school_years SET name = ? WHERE id = ?', [payload.name, payload.id]);
      saveDb();
      backupJson();
      return all('SELECT * FROM school_years ORDER BY name DESC');
    });
    ipcMain.handle('years:delete', (_e, id) => {
      run('DELETE FROM school_years WHERE id = ?', [id]);
      saveDb();
      backupJson();
      return all('SELECT * FROM school_years ORDER BY name DESC');
    });

    ipcMain.handle('classes:list', () => all(`
      SELECT c.*, y.name AS school_year
      FROM classes c
      LEFT JOIN school_years y ON y.id = c.school_year_id
      ORDER BY y.name DESC, c.name COLLATE NOCASE
    `));
    ipcMain.handle('classes:add', (_e, payload) => {
      const now = new Date().toISOString();
      const autoName = `Classe ${payload.level || ''} ${payload.teacher_name || ''}`.trim();
      const className = (payload.name || autoName || 'Classe').trim();
      insertAndGetId(
        'INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?)',
        [payload.school_year_id || null, className, payload.teacher_name || null, payload.level || null, now]
      );
      saveDb();
      backupJson();
      return all('SELECT * FROM classes');
    });
    ipcMain.handle('classes:update', (_e, payload) => {
      const autoName = `Classe ${payload.level || ''} ${payload.teacher_name || ''}`.trim();
      const className = (payload.name || autoName || 'Classe').trim();
      run(
        'UPDATE classes SET school_year_id = ?, name = ?, teacher_name = ?, level = ? WHERE id = ?',
        [payload.school_year_id || null, className, payload.teacher_name || null, payload.level || null, payload.id]
      );
      saveDb();
      backupJson();
      return all('SELECT * FROM classes');
    });
    ipcMain.handle('classes:delete', (_e, id) => {
      run('DELETE FROM classes WHERE id = ?', [id]);
      saveDb();
      backupJson();
      return all('SELECT * FROM classes');
    });
    ipcMain.handle('students:history', (_e, studentId) => {
      return all(`
        SELECT h.*, c.name AS class_name, c.teacher_name, c.level, y.name AS school_year
        FROM student_history h
        LEFT JOIN classes c ON c.id = h.class_id
        LEFT JOIN school_years y ON y.id = h.school_year_id
        WHERE h.student_id = ?
        ORDER BY h.start_date DESC
      `, [studentId]);
    });
    ipcMain.handle('years:close', (_e, payload) => {
      const now = new Date().toISOString();
      const currentYearId = payload.current_year_id;
      const nextName = payload.next_year_name;

      if (!currentYearId || !nextName) {
        throw new Error('Donnees manquantes pour cloturer l\'annee.');
      }

      let nextYear = get('SELECT id FROM school_years WHERE name = ?', [nextName]);
      const nextYearId = nextYear ? nextYear.id : insertAndGetId(
        'INSERT INTO school_years (name, created_at) VALUES (?, ?)',
        [nextName, now]
      );

      (payload.classes || []).forEach((c) => {
        const classId = c.class_id;
        const newName = c.new_name || '';
        const newTeacher = c.new_teacher_name || null;
        const newLevel = c.new_level || null;

        const newClassId = insertAndGetId(
          'INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?)',
          [nextYearId, newName, newTeacher, newLevel, now]
        );

        if (c.carry_students) {
          const students = all('SELECT id FROM students WHERE class_id = ?', [classId]);
          students.forEach((s) => {
            run('UPDATE students SET class_id = ? WHERE id = ?', [newClassId, s.id]);
            updateStudentHistoryOnClassChange(s.id, newClassId);
          });
        }
      });

      saveDb();
      backupJson();
      return true;
    });
  ipcMain.handle('students:delete', (_e, id) => {
    const activeLoan = get('SELECT COUNT(*) AS c FROM loans WHERE student_id = ? AND return_date IS NULL', [id]);
    if (activeLoan && activeLoan.c > 0) {
      throw new Error('Impossible de supprimer cet eleve : il a un ou plusieurs emprunts en cours. Enregistrez d\'abord leur retour.');
    }
    run('DELETE FROM students WHERE id = ?', [id]);
    saveDb();
    backupJson();
    return listStudents();
  });

  ipcMain.handle('loans:list', () => listLoansActive());
  ipcMain.handle('loans:add', (_e, payload) => {
    const available = getAvailableCopies(payload.book_id);
    if (available <= 0) {
      throw new Error('Aucun exemplaire disponible pour ce livre.');
    }
    const now = new Date().toISOString();
    run(`
      INSERT INTO loans (book_id, student_id, loan_date, due_date, return_date)
      VALUES (?, ?, ?, ?, NULL)
    `, [payload.book_id, payload.student_id, now, payload.due_date || null]);
    saveDb();
    backupJson();
    return listLoansActive();
  });
  ipcMain.handle('loans:return', (_e, id) => {
    run('UPDATE loans SET return_date = ? WHERE id = ?', [new Date().toISOString(), id]);
    saveDb();
    backupJson();
    return listLoansActive();
  });
  ipcMain.handle('loans:returnByBook', (_e, payload) => {
    const bookId = payload.book_id ? Number(payload.book_id) : null;
    const studentId = payload.student_id ? Number(payload.student_id) : null;
    if (!bookId) {
      throw new Error('Livre manquant pour le retour.');
    }
    const params = studentId ? [bookId, studentId] : [bookId];
    const where = studentId
      ? 'book_id = ? AND student_id = ? AND return_date IS NULL'
      : 'book_id = ? AND return_date IS NULL';
    const loan = get(`
      SELECT id FROM loans
      WHERE ${where}
      ORDER BY loan_date DESC
      LIMIT 1
    `, params);
    if (!loan) {
      throw new Error('Aucun emprunt en cours pour ce livre.');
    }
    run('UPDATE loans SET return_date = ? WHERE id = ?', [new Date().toISOString(), loan.id]);
    saveDb();
    backupJson();
    return listLoansActive();
  });
  ipcMain.handle('loans:delete', (_e, id) => {
    run('DELETE FROM loans WHERE id = ?', [id]);
    saveDb();
    backupJson();
    return listLoansActive();
  });

  ipcMain.handle('data:export', () => {
    return {
      meta: { generated_at: new Date().toISOString(), version: '0.1.0' },
      books: all('SELECT * FROM books'),
      school_years: all('SELECT * FROM school_years'),
      classes: all('SELECT * FROM classes'),
      students: all('SELECT * FROM students'),
      student_history: all('SELECT * FROM student_history'),
      loans: all('SELECT * FROM loans')
    };
  });

  ipcMain.handle('data:importDb', (_e, payload) => {
    if (!payload || !payload.buffer) {
      throw new Error('Fichier BDD manquant.');
    }
    importDatabaseBuffer(payload.buffer);
    return true;
  });

  ipcMain.handle('import:pick', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Sauvegardes', extensions: ['json', 'xlsx', 'xls', 'sqlite3', 'db'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }
    const info = importFileAtPath(result.filePaths[0]);
    return { canceled: false, ...info };
  });

  ipcMain.handle('data:import', (_e, payload) => {
    const data = payload || {};
    run('DELETE FROM loans');
    run('DELETE FROM student_history');
    run('DELETE FROM students');
    run('DELETE FROM classes');
    run('DELETE FROM school_years');
    run('DELETE FROM books');

    (data.school_years || []).forEach((y) => {
      run(
        'INSERT INTO school_years (id, name, created_at) VALUES (?, ?, ?)',
        [y.id, y.name, y.created_at || new Date().toISOString()]
      );
    });
    (data.classes || []).forEach((c) => {
      run(
        'INSERT INTO classes (id, school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [c.id, c.school_year_id || null, c.name, c.teacher_name || null, c.level || null, c.created_at || new Date().toISOString()]
      );
    });

    (data.books || []).forEach((b) => {
      run(
        'INSERT INTO books (id, isbn, title, author, year, copies, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [b.id, b.isbn || null, b.title, b.author || null, b.year || null, b.copies || 1, b.location || null, b.created_at || new Date().toISOString()]
      );
    });
    (data.students || []).forEach((s) => {
      const normalized = normalizeStudentPayload(s);
      run(
        'INSERT INTO students (id, class_id, last_name, first_name, birth_year, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          s.id,
          normalized.class_id,
          normalized.last_name,
          normalized.first_name,
          normalized.birth_year,
          s.created_at || new Date().toISOString()
        ]
      );
    });
    (data.student_history || []).forEach((h) => {
      run(
        'INSERT INTO student_history (id, student_id, class_id, school_year_id, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        [h.id, h.student_id, h.class_id || null, h.school_year_id || null, h.start_date || new Date().toISOString(), h.end_date || null]
      );
    });
    (data.loans || []).forEach((l) => {
      run(
        'INSERT INTO loans (id, book_id, student_id, loan_date, due_date, return_date) VALUES (?, ?, ?, ?, ?, ?)',
        [l.id, l.book_id, l.student_id, l.loan_date || new Date().toISOString(), l.due_date || null, l.return_date || null]
      );
    });

    saveDb();
    backupJson();
    return true;
  });

  ipcMain.handle('data:exportCustom', (_e, options) => {
    const data = buildExportData(options || {});
    if (options && options.format === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      const combinedRows = [];
      Object.entries(data).forEach(([key, rows]) => {
        if (key === 'meta') return;
        (rows || []).forEach((row) => {
          combinedRows.push({ dataset: key, ...row });
        });
      });
      const sheet = XLSX.utils.json_to_sheet(combinedRows);
      XLSX.utils.book_append_sheet(workbook, sheet, 'export');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return { base64: Buffer.from(buffer).toString('base64') };
    }
    return data;
  });

  ipcMain.handle('data:importCustom', (_e, options) => {
    const payload = options || {};
    const datasets = payload.datasets || [];
    let data = payload.data || {};

    if (payload.format === 'xlsx' && payload.buffer) {
      const buffer = Buffer.from(payload.buffer);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const parsed = {};
      workbook.SheetNames.forEach((name) => {
        const key = normalizeSheetName(name);
        const sheet = workbook.Sheets[name];
        parsed[key] = XLSX.utils.sheet_to_json(sheet, { defval: null });
      });
      data = parsed;
    }

    importMerge(data, datasets);
    return true;
  });
}

app.whenReady().then(async () => {
  try {
    await initDb();
    setupIpc();
    createWindow();
  } catch (err) {
    logStartupError(err);
    dialog.showErrorBox(
      'Biblio-rians - Erreur au demarrage',
      `Une erreur a empeche le demarrage de l'application :\n\n${err && err.message ? err.message : err}\n\nDetails enregistres dans error.log (dossier de donnees de l'application).`
    );
    app.quit();
  }
});

process.on('uncaughtException', (err) => {
  logStartupError(err);
});
process.on('unhandledRejection', (reason) => {
  logStartupError(reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
