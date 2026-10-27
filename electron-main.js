const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const XLSX = require('xlsx');
const { runMigrations } = require('./migrations');
const { getStatistics: computeStatistics } = require('./stats');
const {
  TABLES,
  withTransaction,
  isLibraryDatabase,
  dumpDatabase,
  countData,
  countDatabase,
  isDatabaseEmpty,
  describeCounts,
  replaceAllData,
  sheetsToData,
  mergeData,
  buildBackupFile,
  parseBackupFile,
  AUTO_BACKUP_KIND
} = require('./data-transfer');
const {
  localDateStamp,
  localTimeStamp,
  dailyBackupName,
  safetyBackupName,
  isAutoBackupName,
  selectBackupsToDelete
} = require('./backup-policy');

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
      // Le nom de fichier vient de settings.json : on n'accepte qu'un simple nom
      // de fichier de bibliotheque, jamais un chemin vers un autre dossier.
      const requestedFile = String(item && item.file ? item.file : '').trim();
      const file = /^biblio-[a-z0-9-]+\.sqlite3$/.test(requestedFile) ? requestedFile : `biblio-${key}.sqlite3`;
      if (!key || !name) return;
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

function writeConfig(cfg) {
  const configPath = getConfigPath();
  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmpPath, configPath);
}

function saveConfig() {
  const existing = loadConfig();
  writeConfig({ ...existing, library: currentLibrary, libraries: libraryCatalog });
}

function updateConfig(patch) {
  writeConfig({ ...loadConfig(), ...patch });
}

function enableForeignKeys(database = db) {
  database.run('PRAGMA foreign_keys = ON;');
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

function hasEncryptionHeader(buffer) {
  return buffer.length >= ENC_MAGIC.length && buffer.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);
}

function decryptBuffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!hasEncryptionHeader(source)) return source;
  if (!isEncryptionAvailable()) {
    throw new Error('Le chiffrement n\'est pas disponible sur ce poste pour déchiffrer ce fichier.');
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

function getBackupsDir(libraryKey = currentLibrary) {
  const dir = path.join(app.getPath('userData'), 'backups', slugifyLibraryKey(libraryKey));
  ensureDir(dir);
  return dir;
}

/* Met un fichier de cote (renomme, jamais supprime) et retourne son nouveau chemin. */
function setAsideFile(filePath, label) {
  if (!fs.existsSync(filePath)) return null;
  const target = `${filePath}.${label}-${localTimeStamp()}`;
  fs.renameSync(filePath, target);
  return target;
}

function legacyDbHasData(legacyPath) {
  let legacyDb = null;
  try {
    legacyDb = new SQL.Database(new Uint8Array(fs.readFileSync(legacyPath)));
    return !isDatabaseEmpty(legacyDb);
  } catch (e) {
    return false;
  } finally {
    if (legacyDb) legacyDb.close();
  }
}

function databaseFileIsEmpty(filePath) {
  let database = null;
  try {
    database = new SQL.Database(new Uint8Array(readEncryptedFile(filePath)));
    return isDatabaseEmpty(database);
  } catch (e) {
    // illisible : on n'y touche surtout pas
    return false;
  } finally {
    if (database) database.close();
  }
}

/*
 * Reprise, une seule fois, de l'ancienne base unique "biblio.sqlite3" des
 * toutes premieres versions. Le fichier est ensuite renomme pour que la
 * reprise ne se refasse jamais (avant, elle pouvait ecraser la base actuelle
 * a chaque demarrage).
 */
function migrateLegacyDb() {
  const legacyPath = path.join(app.getPath('userData'), 'biblio.sqlite3');
  if (!fs.existsSync(legacyPath)) return;
  try {
    const primaryPath = getDbPath(DEFAULT_LIBRARIES[0].key);
    if (!fs.existsSync(primaryPath)) {
      fs.copyFileSync(legacyPath, primaryPath);
    } else if (databaseFileIsEmpty(primaryPath) && legacyDbHasData(legacyPath)) {
      setAsideFile(primaryPath, 'avant-reprise');
      fs.copyFileSync(legacyPath, primaryPath);
    }
    fs.renameSync(legacyPath, `${legacyPath}.repris-${localTimeStamp()}`);
  } catch (e) {
    logStartupError(e);
  }
}

async function initDb() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });

  const cfg = loadConfig();
  libraryCatalog = buildLibraryCatalog(cfg.libraries);
  if (cfg.library && getLibraryByKey(cfg.library)) {
    currentLibrary = cfg.library;
  }
  migrateLegacyDb();

  try {
    openDbForLibrary(currentLibrary);
  } catch (err) {
    const rescued = await rescueLibrary(currentLibrary, err, { atStartup: true });
    if (!rescued) return false;
    openDbForLibrary(currentLibrary);
  }
  return true;
}

function ensureSchema() {
  runMigrations(db);
  migrateStudentsToClasses();
  hasStudentNameColumn = columnExists('students', 'name');
}

const UNREADABLE_ELSEWHERE_MESSAGE = 'Ce fichier a été protégé sur un autre ordinateur ou une autre session Windows : il ne peut pas être lu ici. Utilisez plutôt une sauvegarde faite avec le bouton « Sauvegarder ».';

/* Charge et verifie la base d'une bibliotheque, sans rien changer a l'etat courant. */
function loadLibraryDatabase(libraryKey) {
  const dbPath = getDbPath(libraryKey);
  if (!fs.existsSync(dbPath)) {
    const fresh = new SQL.Database();
    runMigrations(fresh);
    enableForeignKeys(fresh);
    return fresh;
  }
  let bytes;
  try {
    bytes = readEncryptedFile(dbPath);
  } catch (err) {
    throw new Error(UNREADABLE_ELSEWHERE_MESSAGE);
  }
  const database = new SQL.Database(new Uint8Array(bytes));
  try {
    runMigrations(database);
    enableForeignKeys(database);
    return database;
  } catch (err) {
    database.close();
    throw new Error(`Le fichier de cette bibliothèque est abîmé (${err.message}).`);
  }
}

/* Pour une restauration : si le fichier existant est illisible, il est mis de cote. */
function openLibraryForRestore(libraryKey) {
  try {
    return loadLibraryDatabase(libraryKey);
  } catch (err) {
    setAsideFile(getDbPath(libraryKey), 'endommage');
    return loadLibraryDatabase(libraryKey);
  }
}

function openDbForLibrary(libraryKey) {
  if (!getLibraryByKey(libraryKey)) {
    throw new Error(`Bibliothèque inconnue: ${libraryKey}`);
  }
  // On ne bascule qu'une fois la nouvelle base lue et verifiee : en cas
  // d'echec, la bibliotheque en cours reste ouverte et intacte.
  const nextDb = loadLibraryDatabase(libraryKey);
  flushAutoBackup();
  if (db && db !== nextDb) db.close();
  db = nextDb;
  currentLibrary = libraryKey;
  currentDbPath = getDbPath(libraryKey);
  ensureSchema();
  saveDb();
  saveConfig();
  ensureTodayBackup();
}

function listLibraries() {
  return libraryCatalog.map((item) => ({ key: item.key, name: item.name }));
}

function libraryDisplayName(key) {
  const entry = getLibraryByKey(key);
  return entry ? entry.name : key;
}

function ensureLibraryEntry(key, name) {
  const cleanKey = slugifyLibraryKey(key || name);
  const existing = getLibraryByKey(cleanKey);
  if (existing) return existing;
  const entry = { key: cleanKey, name: String(name || '').trim() || cleanKey, file: `biblio-${cleanKey}.sqlite3` };
  libraryCatalog.push(entry);
  return entry;
}

function createLibrary(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw new Error('Nom de bibliothèque requis.');
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
    throw new Error('Bibliothèque inconnue.');
  }
  if (isDefaultLibraryKey(libraryKey)) {
    throw new Error('Primaire et Maternelle ne peuvent pas être renommées.');
  }
  const cleanName = String(nextName || '').trim();
  if (!cleanName) {
    throw new Error('Nom de bibliothèque requis.');
  }
  const duplicate = libraryCatalog.find((item) => item.key !== libraryKey && item.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) {
    throw new Error('Une bibliothèque avec ce nom existe déjà.');
  }
  entry.name = cleanName;
  saveConfig();
  return { key: entry.key, name: entry.name };
}

function deleteLibrary(libraryKey) {
  const entry = getLibraryByKey(libraryKey);
  if (!entry) {
    throw new Error('Bibliothèque inconnue.');
  }
  if (isDefaultLibraryKey(libraryKey)) {
    throw new Error('Primaire et Maternelle ne peuvent pas être supprimées.');
  }

  const dbPath = getDbPath(libraryKey);
  libraryCatalog = libraryCatalog.filter((item) => item.key !== libraryKey);

  if (currentLibrary === libraryKey) {
    openDbForLibrary(DEFAULT_LIBRARIES[0].key);
  } else {
    saveConfig();
  }

  // Le fichier n'est pas efface : il est range dans un dossier a part, au cas ou.
  try {
    if (fs.existsSync(dbPath)) {
      const trashDir = path.join(app.getPath('userData'), 'bibliotheques-supprimees');
      ensureDir(trashDir);
      fs.renameSync(dbPath, path.join(trashDir, `${path.basename(dbPath, '.sqlite3')}-${localTimeStamp()}.sqlite3`));
    }
  } catch (e) {
    logStartupError(e);
  }

  return { active: currentLibrary, libraries: listLibraries() };
}

/* Lit un fichier .sqlite3/.db, le dechiffre si besoin et verifie que c'est bien une bibliotheque. */
function loadDatabaseFromBytes(bytes) {
  let plain;
  try {
    plain = decryptBuffer(Buffer.from(bytes));
  } catch (err) {
    throw new Error(UNREADABLE_ELSEWHERE_MESSAGE);
  }
  let candidate = null;
  try {
    candidate = new SQL.Database(new Uint8Array(plain));
    if (!isLibraryDatabase(candidate)) throw new Error('table des livres absente');
    runMigrations(candidate);
    enableForeignKeys(candidate);
    return candidate;
  } catch (err) {
    if (candidate) candidate.close();
    throw new Error('Ce fichier n\'est pas une bibliothèque Biblio-rians valide.');
  }
}

/* Lit un fichier JSON (sauvegarde chiffree par l'application, ou fichier en clair). */
function readBackupJson(filePath) {
  const raw = fs.readFileSync(filePath);
  const trusted = hasEncryptionHeader(raw);
  let content;
  try {
    content = decryptBuffer(raw).toString('utf-8');
  } catch (err) {
    throw new Error(UNREADABLE_ELSEWHERE_MESSAGE);
  }
  try {
    return { obj: JSON.parse(content.replace(/^\uFEFF/, '')), trusted };
  } catch (err) {
    throw new Error('Ce fichier n\'est pas un fichier de données valide (il est peut-être abîmé).');
  }
}

function columnExists(table, column) {
  const cols = all(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function saveDb() {
  const data = db.export();
  // sql.js ferme puis rouvre la connexion pendant export() : les reglages de
  // connexion sont perdus et les cles etrangeres doivent etre reactivees.
  enableForeignKeys();
  const dbPath = currentDbPath || getDbPath(currentLibrary);
  writeEncryptedFile(dbPath, Buffer.from(data));
}

function countRows(table) {
  const row = get(`SELECT COUNT(*) AS c FROM ${table}`);
  return row ? Number(row.c || 0) : 0;
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

/*
 * Sauvegardes automatiques (voir backup-policy.js) : une par jour et par
 * bibliotheque, plus une copie de securite avant chaque operation risquee.
 * Elles restent chiffrees et sur ce poste ; la sauvegarde "cle USB"
 * (saveBackupToFile) est celle qui protege d'une panne de l'ordinateur.
 */
function writeAutoBackup(fileName, database, libraryKey) {
  const dir = getBackupsDir(libraryKey);
  const payload = {
    meta: {
      kind: AUTO_BACKUP_KIND,
      library: libraryKey,
      library_name: libraryDisplayName(libraryKey),
      app_version: app.getVersion(),
      generated_at: new Date().toISOString()
    },
    ...dumpDatabase(database)
  };
  writeEncryptedFile(path.join(dir, fileName), Buffer.from(JSON.stringify(payload), 'utf-8'));
  pruneAutoBackups(dir);
}

function writeDailyBackup() {
  if (!db) return;
  writeAutoBackup(dailyBackupName(), db, currentLibrary);
}

function writeSafetyBackup(reason, database = db, libraryKey = currentLibrary) {
  if (!database || isDatabaseEmpty(database)) return;
  writeAutoBackup(safetyBackupName(reason), database, libraryKey);
}

function ensureTodayBackup() {
  try {
    if (!fs.existsSync(path.join(getBackupsDir(), dailyBackupName()))) {
      writeDailyBackup();
    }
  } catch (e) {
    logStartupError(e);
  }
}

function pruneAutoBackups(dir) {
  try {
    selectBackupsToDelete(fs.readdirSync(dir)).forEach((name) => {
      try { fs.unlinkSync(path.join(dir, name)); } catch (e) { /* ignore prune errors */ }
    });
  } catch (e) {
    // ignore prune errors
  }
}

const AUTO_BACKUP_DELAY_MS = 2 * 60 * 1000;
let autoBackupTimer = null;
let autoBackupPending = false;

/* Apres une modification : la sauvegarde du jour est mise a jour au plus tard 2 minutes apres. */
function markDirty() {
  autoBackupPending = true;
  if (!autoBackupTimer) {
    autoBackupTimer = setTimeout(flushAutoBackup, AUTO_BACKUP_DELAY_MS);
  }
}

function flushAutoBackup() {
  if (autoBackupTimer) {
    clearTimeout(autoBackupTimer);
    autoBackupTimer = null;
  }
  if (!autoBackupPending || !db) return;
  autoBackupPending = false;
  try {
    writeDailyBackup();
  } catch (e) {
    logStartupError(e);
  }
}

function persist() {
  saveDb();
  markDirty();
}

function listAutoBackups(libraryKey) {
  const entries = [];
  const collect = (dir, accept) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(accept).forEach((name) => {
      const fullPath = path.join(dir, name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) entries.push({ path: fullPath, mtime: stat.mtimeMs });
      } catch (e) { /* fichier disparu */ }
    });
  };
  collect(getBackupsDir(libraryKey), isAutoBackupName);
  if (libraryKey === DEFAULT_LIBRARIES[0].key) {
    // anciennes sauvegardes (versions <= 0.1.5), rangees a la racine du dossier
    collect(path.join(app.getPath('userData'), 'backups'), (name) => name.startsWith('backup-') && name.endsWith('.json'));
  }
  return entries.sort((a, b) => b.mtime - a.mtime);
}

function findLatestReadableAutoBackup(libraryKey) {
  const candidates = listAutoBackups(libraryKey).slice(0, 40);
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const { obj } = readBackupJson(candidates[i].path);
      const parsed = parseBackupFile(obj, { trusted: true });
      if (parsed && parsed.kind === 'single') {
        return { path: candidates[i].path, date: parsed.generatedAt || candidates[i].mtime, data: parsed.data };
      }
    } catch (e) {
      // sauvegarde illisible : on essaie la suivante
    }
  }
  return null;
}

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(d)} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

async function showMessage(parent, options) {
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

async function askConfirmation({ title, message, detail, confirmLabel, type = 'warning', parent = mainWindow }) {
  const { response } = await showMessage(parent, {
    type,
    title,
    message,
    detail,
    buttons: ['Annuler', confirmLabel || 'Continuer'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return response === 1;
}

/* Remplace le contenu des bibliotheques listees, avec copie de securite avant. */
function restoreLibraries(libraries) {
  flushAutoBackup();
  let currentRestored = false;
  libraries.forEach((lib) => {
    const entry = ensureLibraryEntry(lib.key, lib.name);
    const isCurrent = !!db && entry.key === currentLibrary;
    const target = isCurrent ? db : openLibraryForRestore(entry.key);
    try {
      writeSafetyBackup('avant-restauration', target, entry.key);
      replaceAllData(target, lib.data);
      if (isCurrent) {
        saveDb();
        currentRestored = true;
      } else {
        writeEncryptedFile(getDbPath(entry.key), Buffer.from(target.export()));
      }
    } finally {
      if (!isCurrent) target.close();
    }
  });
  saveConfig();
  if (currentRestored) {
    hasStudentNameColumn = columnExists('students', 'name');
    markDirty();
  }
}

function restorePlan(libraries, generatedAt) {
  const when = generatedAt ? ` du ${formatDateTime(generatedAt)}` : '';
  const list = libraries.map((lib) => `• ${lib.name || lib.key} : ${describeCounts(countData(lib.data))}`).join('\n');
  return {
    title: 'Restaurer une sauvegarde',
    message: libraries.length > 1
      ? `Restaurer ces ${libraries.length} bibliothèques à partir de la sauvegarde${when} ?`
      : `Restaurer « ${libraries[0].name || libraries[0].key} » à partir de la sauvegarde${when} ?`,
    detail: `Contenu de la sauvegarde :\n${list}\n\nLe contenu actuel sera remplacé par celui de la sauvegarde. Une copie de sécurité du contenu actuel est conservée automatiquement.`,
    confirmLabel: 'Restaurer',
    apply: () => {
      restoreLibraries(libraries);
      return libraries.length > 1
        ? `Sauvegarde restaurée (${libraries.length} bibliothèques).`
        : `Bibliothèque « ${libraries[0].name || libraries[0].key} » restaurée.`;
    }
  };
}

function describeMergeReport(report) {
  const parts = [];
  const add = (n, one, many) => { if (n) parts.push(`${n} ${n > 1 ? many : one}`); };
  add(report.books, 'livre', 'livres');
  add(report.students, 'élève', 'élèves');
  add(report.classes, 'classe', 'classes');
  add(report.school_years, 'année scolaire', 'années scolaires');
  add(report.loans, 'prêt', 'prêts');
  add(report.student_history, 'ligne d\'historique', 'lignes d\'historique');
  let message = parts.length
    ? `Import terminé. Ajouté : ${parts.join(', ')}.`
    : 'Import terminé : tout était déjà présent, rien à ajouter.';
  if (report.skipped) {
    message += ` ${report.skipped} ligne(s) ignorée(s) (livre ou élève introuvable, ou ligne incomplète).`;
  }
  return message;
}

function mergePlan(data) {
  const counts = countData(data);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!total) {
    throw new Error('Ce fichier ne contient aucune donnée reconnue (livres, élèves, classes...).');
  }
  const name = libraryDisplayName(currentLibrary);
  return {
    type: 'question',
    title: 'Importer des données',
    message: `Ajouter le contenu de ce fichier à la bibliothèque « ${name} » ?`,
    detail: `Le fichier contient : ${describeCounts(counts)}.\n\nRien n'est supprimé : seuls les éléments absents sont ajoutés, sans doublon. Une copie de sécurité est faite avant.`,
    confirmLabel: 'Importer',
    apply: () => {
      writeSafetyBackup('avant-import');
      const report = mergeData(db, data, TABLES);
      persist();
      return describeMergeReport(report);
    }
  };
}

function replaceDatabasePlan(candidate) {
  const name = libraryDisplayName(currentLibrary);
  return {
    title: 'Remplacer la bibliothèque',
    message: `Remplacer tout le contenu de « ${name} » par celui de ce fichier ?`,
    detail: `Contenu actuel : ${describeCounts(countDatabase(db))}.\nContenu du fichier : ${describeCounts(countDatabase(candidate))}.\n\nUne copie de sécurité du contenu actuel est conservée automatiquement.`,
    confirmLabel: 'Remplacer',
    apply: () => {
      writeSafetyBackup('avant-remplacement');
      const previous = db;
      db = candidate;
      ensureSchema();
      persist();
      previous.close();
      return `Bibliothèque « ${name} » remplacée par le contenu du fichier.`;
    },
    cancel: () => candidate.close()
  };
}

/* Analyse un fichier choisi par l'utilisateur et prepare l'operation a confirmer. */
function analyzeImportFile(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.sqlite3' || ext === '.db') {
    return replaceDatabasePlan(loadDatabaseFromBytes(fs.readFileSync(filePath)));
  }
  if (ext === '.json') {
    const { obj, trusted } = readBackupJson(filePath);
    const parsed = parseBackupFile(obj, { trusted });
    if (parsed && parsed.kind === 'full') {
      if (!parsed.libraries.length) throw new Error('Cette sauvegarde ne contient aucune bibliothèque.');
      return restorePlan(parsed.libraries, parsed.generatedAt);
    }
    if (parsed && parsed.kind === 'single') {
      const key = parsed.library && getLibraryByKey(parsed.library) ? parsed.library : currentLibrary;
      return restorePlan([{ key, name: libraryDisplayName(key), data: parsed.data }], parsed.generatedAt);
    }
    return mergePlan(obj);
  }
  if (ext === '.xlsx' || ext === '.xls') {
    let workbook;
    try {
      workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    } catch (err) {
      throw new Error('Ce fichier Excel n\'a pas pu être lu.');
    }
    const sheets = {};
    workbook.SheetNames.forEach((name) => {
      sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null });
    });
    return mergePlan(sheetsToData(sheets));
  }
  throw new Error('Format de fichier non pris en charge. Choisissez un fichier .json, .xlsx, .xls, .sqlite3 ou .db.');
}

async function runImportFile(filePath) {
  const plan = analyzeImportFile(filePath);
  const ok = await askConfirmation(plan);
  if (!ok) {
    if (plan.cancel) plan.cancel();
    return { canceled: true };
  }
  return { canceled: false, message: plan.apply() };
}

/* Sauvegarde "cle USB" : toutes les bibliotheques, en clair, lisible sur n'importe quel ordinateur. */
function collectAllLibraries() {
  const libraries = [];
  const unreadable = [];
  libraryCatalog.forEach((entry) => {
    if (db && entry.key === currentLibrary) {
      libraries.push({ key: entry.key, name: entry.name, data: dumpDatabase(db) });
      return;
    }
    const filePath = getDbPath(entry.key);
    if (!fs.existsSync(filePath)) return;
    let other = null;
    try {
      other = new SQL.Database(new Uint8Array(readEncryptedFile(filePath)));
      libraries.push({ key: entry.key, name: entry.name, data: dumpDatabase(other) });
    } catch (e) {
      unreadable.push(entry.name);
    } finally {
      if (other) other.close();
    }
  });
  return { libraries, unreadable };
}

async function saveBackupToFile() {
  const { libraries, unreadable } = collectAllLibraries();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer la sauvegarde',
    defaultPath: path.join(app.getPath('documents'), `Sauvegarde Biblio-rians ${localDateStamp()}.json`),
    buttonLabel: 'Enregistrer la sauvegarde',
    filters: [{ name: 'Sauvegarde Biblio-rians', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const payload = buildBackupFile({ appVersion: app.getVersion(), libraries });
  const tmpPath = `${result.filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf-8');
  fs.renameSync(tmpPath, result.filePath);

  // Verification : on relit le fichier tel qu'il a ete ecrit sur le disque ou la cle.
  let check = null;
  try {
    check = parseBackupFile(JSON.parse(fs.readFileSync(result.filePath, 'utf-8')));
  } catch (e) {
    check = null;
  }
  if (!check || check.kind !== 'full' || check.libraries.length !== libraries.length) {
    throw new Error('La sauvegarde a été écrite mais sa vérification a échoué. Réessayez, ou choisissez un autre emplacement.');
  }

  updateConfig({ lastExternalBackupAt: new Date().toISOString() });
  let message = `Sauvegarde enregistrée et vérifiée : ${result.filePath}`;
  if (unreadable.length) {
    message += ` (attention : ${unreadable.join(', ')} n'a pas pu être lue et n'est pas dans la sauvegarde)`;
  }
  return { canceled: false, path: result.filePath, message };
}

async function saveExcelTemplate() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer le modèle Excel',
    defaultPath: path.join(app.getPath('documents'), 'Modèle Biblio-rians.xlsx'),
    buttonLabel: 'Enregistrer le modèle',
    filters: [{ name: 'Classeur Excel', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const workbook = XLSX.utils.book_new();
  const guide = [
    ['Comment remplir ce fichier'],
    [''],
    ['1. Remplissez la feuille « Élèves » : une ligne par élève.'],
    ['2. Remplissez la feuille « Livres » : une ligne par livre (titre obligatoire).'],
    ['3. Ne changez pas la première ligne de chaque feuille (les titres des colonnes).'],
    ['4. Enregistrez, puis dans Biblio-rians : Réglages > Importer un fichier.'],
    [''],
    ['Les classes et années scolaires manquantes sont créées automatiquement.'],
    ['Rien n\'est supprimé : les élèves et livres déjà présents ne sont pas ajoutés en double.']
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(guide), 'Mode d\'emploi');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nom', 'Prénom', 'Niveau', 'Enseignant', 'Classe', 'Année scolaire', 'Année de naissance']
  ]), 'Élèves');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Titre', 'Auteur', 'ISBN', 'Année', 'Exemplaires', 'Numéro', 'Emplacement']
  ]), 'Livres');
  XLSX.writeFile(workbook, result.filePath);
  return { canceled: false, message: `Modèle enregistré : ${result.filePath}` };
}

function getBackupStatus() {
  const lastAt = loadConfig().lastExternalBackupAt || null;
  const days = lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / (24 * 3600 * 1000)) : null;
  return { lastAt, days };
}

/*
 * Secours quand une bibliotheque ne s'ouvre pas (fichier abime, session
 * Windows changee...). Au lieu de fermer l'application, on propose de
 * restaurer. Le fichier fautif n'est jamais efface, seulement mis de cote.
 * Retourne true si la bibliotheque peut maintenant etre ouverte.
 */
async function rescueLibrary(libraryKey, error, { atStartup = false } = {}) {
  logStartupError(error);
  const entry = getLibraryByKey(libraryKey) || DEFAULT_LIBRARIES[0];
  const parent = atStartup ? null : mainWindow;

  for (;;) {
    const latest = findLatestReadableAutoBackup(entry.key);
    const choices = [];
    if (latest) choices.push({ id: 'auto', label: `Restaurer la sauvegarde automatique du ${formatDateTime(latest.date)}` });
    choices.push({ id: 'file', label: 'Choisir un fichier de sauvegarde (clé USB…)' });
    choices.push({ id: 'empty', label: 'Repartir d\'une bibliothèque vide' });
    choices.push({ id: 'cancel', label: atStartup ? 'Quitter' : 'Annuler' });

    const { response } = await showMessage(parent, {
      type: 'error',
      title: 'Biblio-rians - Problème d\'ouverture',
      message: `La bibliothèque « ${entry.name} » n'a pas pu être ouverte.`,
      detail: `${error && error.message ? error.message : error}\n\nPas d'inquiétude : le fichier actuel ne sera pas effacé, il sera seulement mis de côté dans le dossier de l'application.\n\nQue voulez-vous faire ?`,
      buttons: choices.map((c) => c.label),
      defaultId: 0,
      cancelId: choices.length - 1,
      noLink: true
    });
    const choice = choices[response] ? choices[response].id : 'cancel';
    if (choice === 'cancel') return false;

    try {
      if (choice === 'auto') {
        restoreLibraries([{ key: entry.key, name: entry.name, data: latest.data }]);
        return true;
      }
      if (choice === 'empty') {
        const ok = await askConfirmation({
          parent,
          title: 'Repartir de zéro',
          message: `Repartir d'une bibliothèque « ${entry.name} » vide ?`,
          detail: 'Le fichier actuel est conservé de côté (il n\'est pas supprimé), au cas où il pourrait être récupéré plus tard.',
          confirmLabel: 'Repartir de zéro'
        });
        if (!ok) continue;
        setAsideFile(getDbPath(entry.key), 'endommage');
        return true;
      }
      if (choice === 'file' && await rescueFromFile(entry, parent)) {
        return true;
      }
    } catch (err) {
      await showMessage(parent, {
        type: 'error',
        title: 'Biblio-rians',
        message: 'La restauration n\'a pas pu être faite.',
        detail: err && err.message ? err.message : String(err),
        buttons: ['OK'],
        noLink: true
      });
    }
  }
}

async function rescueFromFile(entry, parent) {
  const options = {
    title: 'Choisir une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegardes Biblio-rians', extensions: ['json', 'sqlite3', 'db'] }]
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return false;
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.sqlite3' || ext === '.db') {
    const candidate = loadDatabaseFromBytes(fs.readFileSync(filePath));
    try {
      const ok = await askConfirmation({
        parent,
        title: 'Restaurer une sauvegarde',
        message: `Utiliser ce fichier pour « ${entry.name} » ?`,
        detail: `Contenu du fichier : ${describeCounts(countDatabase(candidate))}.`,
        confirmLabel: 'Restaurer'
      });
      if (!ok) return false;
      setAsideFile(getDbPath(entry.key), 'endommage');
      writeEncryptedFile(getDbPath(entry.key), Buffer.from(candidate.export()));
      return true;
    } finally {
      candidate.close();
    }
  }

  const { obj, trusted } = readBackupJson(filePath);
  const parsed = parseBackupFile(obj, { trusted });
  if (!parsed) {
    throw new Error('Ce fichier est un export, pas une sauvegarde complète. Choisissez un fichier créé avec le bouton « Sauvegarder ».');
  }
  const libraries = parsed.kind === 'full'
    ? parsed.libraries
    : [{ key: entry.key, name: entry.name, data: parsed.data }];
  if (!libraries.some((lib) => slugifyLibraryKey(lib.key || lib.name) === entry.key)) {
    throw new Error(`Cette sauvegarde ne contient pas la bibliothèque « ${entry.name} ».`);
  }
  const plan = restorePlan(libraries, parsed.generatedAt);
  if (!await askConfirmation({ ...plan, parent })) return false;
  plan.apply();
  return true;
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
  writeConfig(cfg);
}

function verifyAuthPassword(password) {
  const cfg = loadConfig();
  if (!cfg.auth || !cfg.auth.hash || !cfg.auth.salt) return true;
  const attempt = Buffer.from(hashPassword(password, cfg.auth.salt));
  const expected = Buffer.from(cfg.auth.hash);
  if (attempt.length !== expected.length) return false;
  return crypto.timingSafeEqual(attempt, expected);
}

/*
 * Verrou : l'etat "deverrouille" est tenu ici, dans le processus principal,
 * et non dans l'interface. Tant qu'il n'est pas leve, toutes les demandes de
 * donnees sont refusees (voir handle()). Apres 5 essais rates, on impose une
 * pause de 30 secondes.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;
let unlocked = false;
let failedAttempts = 0;
let lockedUntil = 0;

function isUnlocked() {
  return unlocked || !isAuthSet();
}

function tryUnlock(password) {
  if (!isAuthSet()) {
    unlocked = true;
    return { ok: true };
  }
  const now = Date.now();
  if (now < lockedUntil) {
    return { ok: false, waitSeconds: Math.ceil((lockedUntil - now) / 1000) };
  }
  if (verifyAuthPassword(password)) {
    unlocked = true;
    failedAttempts = 0;
    return { ok: true };
  }
  failedAttempts += 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    failedAttempts = 0;
    lockedUntil = now + LOCKOUT_MS;
    return { ok: false, waitSeconds: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { ok: false };
}

function changePassword(nextPassword, currentPassword) {
  if (isAuthSet() && !verifyAuthPassword(currentPassword)) {
    throw new Error('Le mot de passe actuel est incorrect.');
  }
  if (nextPassword && nextPassword.length < 4) {
    throw new Error('Le mot de passe doit contenir au moins 4 caractères.');
  }
  setAuthPassword(nextPassword);
  unlocked = true;
}

function lockApp() {
  if (isAuthSet()) unlocked = false;
  return !unlocked;
}

/*
 * Mises a jour automatiques (version installee seulement) : la nouvelle
 * version est telechargee discretement depuis les publications GitHub du
 * projet, puis installee a la fermeture de l'application. Sans internet, rien
 * ne se passe. Les donnees ne sont pas touchees (elles sont dans le dossier
 * de l'utilisateur, pas dans celui du programme).
 */
const UPDATE_CHECK_DELAY_MS = 15 * 1000;

function setupAutoUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    logStartupError(e);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => {
    // pas d'internet, GitHub indisponible... : on reessaiera au prochain lancement
    logStartupError(`Mise a jour impossible : ${err && err.message ? err.message : err}`);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    if (!mainWindow) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise à jour prête',
      message: `Une nouvelle version de Biblio-rians (${info.version}) est prête.`,
      detail: 'Elle sera installée automatiquement à la prochaine fermeture de l\'application. Vos livres, élèves et prêts sont conservés.',
      buttons: ['Plus tard', 'Redémarrer maintenant'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (response === 1) {
      flushAutoBackup();
      autoUpdater.quitAndInstall();
    }
  });
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => { /* deja consigne par l'evenement 'error' */ });
  }, UPDATE_CHECK_DELAY_MS);
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
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Biblio-rians - Bibliothèque scolaire'
  });

  // La fenetre n'affiche que l'application : pas de navigation vers un autre
  // contenu, pas de nouvelle fenetre, pas d'acces camera/micro/position...
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      const isF12 = key === 'f12';
      const isDevToolsCombo = input.control && input.shift && key === 'i';
      if (isF12 || isDevToolsCombo) {
        event.preventDefault();
      }
    });
  }

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
    meta: { generated_at: new Date().toISOString(), version: app.getVersion() }
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

const LOAN_SELECT = `
    SELECT l.*, b.title AS book_title, b.isbn AS book_isbn,
      TRIM(COALESCE(s.last_name, '') || ' ' || COALESCE(s.first_name, '')) AS student_name,
      c.name AS class_name, c.teacher_name, y.name AS school_year
    FROM loans l
    JOIN books b ON b.id = l.book_id
    JOIN students s ON s.id = l.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN school_years y ON y.id = c.school_year_id`;

function listLoansAll() {
  return all(`${LOAN_SELECT}
    ORDER BY l.loan_date DESC`);
}

function listLoansActive() {
  return all(`${LOAN_SELECT}
    WHERE l.return_date IS NULL
    ORDER BY l.loan_date DESC`);
}

const LOAN_HISTORY_LIMIT = 500;

function listLoansReturned() {
  return all(`${LOAN_SELECT}
    WHERE l.return_date IS NOT NULL
    ORDER BY l.return_date DESC
    LIMIT ${LOAN_HISTORY_LIMIT}`);
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
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&opération=searchRetrieve&query=isbn=${clean}&maximumRecords=1&recordSchema=dc`;
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
          coverUrl: ((v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '').replace(/^http:\/\//, 'https://')
        };
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/*
 * Garde-fous des echanges avec l'interface (IPC). Chaque demande :
 *  1. doit venir de la page de l'application (pas d'un autre contenu) ;
 *  2. est refusee tant que l'application est verrouillee par mot de passe
 *     (sauf les demandes de deverrouillage) ;
 *  3. voit ses donnees nettoyees et verifiees (types, longueurs, plages)
 *     avant d'atteindre la base ;
 *  4. renvoie un message d'erreur comprehensible en cas de refus SQLite.
 */
function normalizeFileUrl(url) {
  try {
    return decodeURIComponent(String(url).split('#')[0].split('?')[0]).toLowerCase();
  } catch (e) {
    return '';
  }
}

const RENDERER_URL = normalizeFileUrl(pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href);

function assertTrustedSender(event) {
  const url = event && event.senderFrame ? event.senderFrame.url : '';
  if (!url || normalizeFileUrl(url) !== RENDERER_URL) {
    throw new Error('Demande refusée.');
  }
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('Élément introuvable.');
  }
  return n;
}

function optionalId(value) {
  return value === undefined || value === null || value === '' ? null : toId(value);
}

function cleanText(value, max = 200) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return text || null;
}

function requiredText(value, label, max = 200) {
  const text = cleanText(value, max);
  if (!text) throw new Error(`${label} est obligatoire.`);
  return text;
}

function optionalInt(value, min, max, label) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} doit être un nombre entre ${min} et ${max}.`);
  }
  return n;
}

function optionalDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || Number.isNaN(new Date(text).getTime())) {
    throw new Error('La date n\'est pas valide.');
  }
  return text.slice(0, 30);
}

function httpsUrlOrNull(value) {
  const url = cleanText(value, 500);
  return url && /^https:\/\/[^\s"'<>]+$/.test(url) ? url : null;
}

function sanitizeBook(payload, withId) {
  const p = asObject(payload);
  return {
    cover_url: httpsUrlOrNull(p.cover_url),
    ...(withId ? { id: toId(p.id) } : {}),
    isbn: cleanText(p.isbn, 30),
    title: requiredText(p.title, 'Le titre', 300),
    author: cleanText(p.author, 200),
    year: optionalInt(p.year, 0, 2100, 'L\'année de publication'),
    copies: optionalInt(p.copies, 1, 999, 'Le nombre d\'exemplaires') || 1,
    numero: cleanText(p.numero, 50),
    location: cleanText(p.location, 200)
  };
}

function sanitizeStudent(payload, withId) {
  const p = asObject(payload);
  const out = {
    ...(withId ? { id: toId(p.id) } : {}),
    class_id: optionalId(p.class_id),
    last_name: cleanText(p.last_name, 100),
    first_name: cleanText(p.first_name, 100),
    birth_year: optionalInt(p.birth_year, 1900, 2100, 'L\'année de naissance'),
    class: cleanText(p.class, 120),
    school_year: cleanText(p.school_year, 40)
  };
  if (!out.last_name && !out.first_name) {
    throw new Error('Le nom ou le prénom de l\'élève est obligatoire.');
  }
  return out;
}

function sanitizeYear(payload, withId) {
  const p = asObject(payload);
  return {
    ...(withId ? { id: toId(p.id) } : {}),
    name: requiredText(p.name, 'Le nom de l\'année scolaire', 40)
  };
}

function sanitizeClass(payload, withId) {
  const p = asObject(payload);
  return {
    ...(withId ? { id: toId(p.id) } : {}),
    school_year_id: optionalId(p.school_year_id),
    name: cleanText(p.name, 120),
    teacher_name: cleanText(p.teacher_name, 120),
    level: cleanText(p.level, 40)
  };
}

function sanitizeYearClose(payload) {
  const p = asObject(payload);
  const classes = Array.isArray(p.classes) ? p.classes.slice(0, 500) : [];
  return {
    current_year_id: toId(p.current_year_id),
    next_year_name: requiredText(p.next_year_name, 'Le nom de la nouvelle année', 40),
    classes: classes.map((item) => {
      const c = asObject(item);
      return {
        class_id: toId(c.class_id),
        new_name: cleanText(c.new_name, 120) || '',
        new_teacher_name: cleanText(c.new_teacher_name, 120),
        new_level: cleanText(c.new_level, 40),
        carry_students: c.carry_students === true
      };
    })
  };
}

function sanitizeExportOptions(options) {
  const o = asObject(options);
  const fields = {};
  Object.entries(asObject(o.fields)).forEach(([dataset, list]) => {
    if (!TABLES.includes(dataset) || !Array.isArray(list)) return;
    fields[dataset] = list.map(String).filter((name) => /^[a-z_]{1,40}$/.test(name));
  });
  return {
    format: o.format === 'xlsx' ? 'xlsx' : 'json',
    datasets: (Array.isArray(o.datasets) ? o.datasets : []).filter((d) => TABLES.includes(d)),
    fields
  };
}

const libraryKeyArg = (value) => requiredText(value, 'La bibliothèque', 80);
const passwordArg = (value) => (value === undefined || value === null ? '' : String(value).slice(0, 200));

/* Nettoyage des arguments, par canal. Un canal absent de la liste ne recoit aucun argument. */
const ARGUMENT_RULES = {
  'auth:set': [passwordArg, passwordArg],
  'auth:verify': [passwordArg],
  'library:create': [(v) => requiredText(v, 'Le nom de la bibliothèque', 80)],
  'library:rename': [libraryKeyArg, (v) => requiredText(v, 'Le nom de la bibliothèque', 80)],
  'library:delete': [libraryKeyArg],
  'library:set': [libraryKeyArg],
  'books:add': [(p) => sanitizeBook(p, false)],
  'books:update': [(p) => sanitizeBook(p, true)],
  'books:delete': [toId],
  'books:lookup': [(v) => cleanText(v, 30) || ''],
  'books:setCover': [toId, (v) => httpsUrlOrNull(v)],
  'students:add': [(p) => sanitizeStudent(p, false)],
  'students:update': [(p) => sanitizeStudent(p, true)],
  'students:delete': [toId],
  'students:history': [toId],
  'years:add': [(p) => sanitizeYear(p, false)],
  'years:update': [(p) => sanitizeYear(p, true)],
  'years:delete': [toId],
  'years:close': [sanitizeYearClose],
  'classes:add': [(p) => sanitizeClass(p, false)],
  'classes:update': [(p) => sanitizeClass(p, true)],
  'classes:delete': [toId],
  'loans:add': [(p) => {
    const o = asObject(p);
    return { book_id: toId(o.book_id), student_id: toId(o.student_id), due_date: optionalDate(o.due_date) };
  }],
  'loans:return': [toId],
  'loans:delete': [toId],
  'loans:returnByBook': [(p) => {
    const o = asObject(p);
    return { book_id: toId(o.book_id), student_id: optionalId(o.student_id) };
  }],
  'import:pick': [(o) => ({ fromAutoBackups: asObject(o).fromAutoBackups === true })],
  'data:exportCustom': [sanitizeExportOptions]
};

const PUBLIC_CHANNELS = new Set(['auth:isSet', 'auth:verify']);

function friendlyError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/UNIQUE constraint failed: school_years\.name/.test(message)) {
    return new Error('Cette année scolaire existe déjà.');
  }
  if (/FOREIGN KEY constraint failed/.test(message)) {
    return new Error('Impossible : cet élément est encore utilisé ailleurs (par exemple par un prêt).');
  }
  if (/NOT NULL constraint failed/.test(message)) {
    return new Error('Une information obligatoire est manquante.');
  }
  return err instanceof Error ? err : new Error(message);
}

function handle(channel, handler) {
  const rules = ARGUMENT_RULES[channel] || [];
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    if (!PUBLIC_CHANNELS.has(channel) && !isUnlocked()) {
      throw new Error('L\'application est verrouillée. Saisissez le mot de passe.');
    }
    try {
      const cleanArgs = rules.map((rule, index) => rule(args[index]));
      return await handler(event, ...cleanArgs);
    } catch (err) {
      throw friendlyError(err);
    }
  });
}

function setupIpc() {
  handle('auth:isSet', () => isAuthSet());
  handle('auth:verify', (_e, password) => tryUnlock(password));
  handle('auth:set', (_e, nextPassword, currentPassword) => {
    changePassword(nextPassword, currentPassword);
    return true;
  });
  handle('auth:lock', () => lockApp());

  handle('library:get', () => currentLibrary);
  handle('library:list', () => listLibraries());
  handle('library:create', (_e, name) => createLibrary(name));
  handle('library:rename', (_e, libraryKey, nextName) => renameLibrary(libraryKey, nextName));
  handle('library:delete', (_e, libraryKey) => deleteLibrary(libraryKey));
  handle('library:info', () => getDbStats());
  handle('stats:get', () => computeStatistics(db));
  handle('library:set', async (_e, libraryKey) => {
    if (!getLibraryByKey(libraryKey)) {
      throw new Error('Bibliothèque inconnue.');
    }
    try {
      openDbForLibrary(libraryKey);
    } catch (err) {
      const rescued = await rescueLibrary(libraryKey, err);
      if (!rescued) {
        throw new Error('Cette bibliothèque n\'a pas pu être ouverte. La bibliothèque précédente reste active.');
      }
      openDbForLibrary(libraryKey);
    }
    return currentLibrary;
  });
  handle('backup:save', () => saveBackupToFile());
  handle('backup:status', () => getBackupStatus());
  handle('books:list', () => listBooks());
  handle('books:add', (_e, payload) => {
    const now = new Date().toISOString();
    run(`
      INSERT INTO books (isbn, title, author, year, copies, numero, location, cover_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [payload.isbn || null, payload.title, payload.author || null, payload.year || null, payload.copies || 1, payload.numero || null, payload.location || null, payload.cover_url || null, now]);
    persist();
    return listBooks();
  });
  handle('books:update', (_e, payload) => {
    run(`
      UPDATE books
      SET isbn = ?, title = ?, author = ?, year = ?, copies = ?, numero = ?, location = ?,
        cover_url = CASE
          WHEN ? IS NOT NULL THEN ?
          WHEN COALESCE(isbn, '') <> COALESCE(?, '') THEN NULL
          ELSE cover_url
        END
      WHERE id = ?
    `, [payload.isbn || null, payload.title, payload.author || null, payload.year || null, payload.copies || 1, payload.numero || null, payload.location || null,
      payload.cover_url || null, payload.cover_url || null, payload.isbn || null, payload.id]);
    persist();
    return listBooks();
  });
  handle('books:delete', (_e, id) => {
    const activeLoan = get('SELECT COUNT(*) AS c FROM loans WHERE book_id = ? AND return_date IS NULL', [id]);
    if (activeLoan && activeLoan.c > 0) {
      throw new Error('Impossible de supprimer ce livre : un ou plusieurs exemplaires sont actuellement empruntés. Enregistrez d\'abord leur retour.');
    }
    run('DELETE FROM books WHERE id = ?', [id]);
    persist();
    return listBooks();
  });
  handle('books:lookup', async (_e, isbn) => {
    return lookupIsbn(isbn);
  });
  handle('books:setCover', (_e, id, coverUrl) => {
    run('UPDATE books SET cover_url = ? WHERE id = ?', [coverUrl, id]);
    persist();
    return true;
  });

  handle('students:list', () => listStudents());
  handle('students:add', (_e, payload) => {
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
    persist();
    return listStudents();
  });
  handle('students:update', (_e, payload) => {
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
    persist();
    return listStudents();
  });
    handle('years:list', () => all('SELECT * FROM school_years ORDER BY name DESC'));
    handle('years:add', (_e, payload) => {
      const now = new Date().toISOString();
      insertAndGetId('INSERT INTO school_years (name, created_at) VALUES (?, ?)', [payload.name, now]);
      persist();
      return all('SELECT * FROM school_years ORDER BY name DESC');
    });
    handle('years:update', (_e, payload) => {
      run('UPDATE school_years SET name = ? WHERE id = ?', [payload.name, payload.id]);
      persist();
      return all('SELECT * FROM school_years ORDER BY name DESC');
    });
    handle('years:delete', (_e, id) => {
      const usedBy = get('SELECT COUNT(*) AS c FROM classes WHERE school_year_id = ?', [id]);
      if (usedBy && usedBy.c > 0) {
        throw new Error(`Cette année scolaire contient encore ${usedBy.c} classe(s). Supprimez d'abord ces classes.`);
      }
      run('DELETE FROM school_years WHERE id = ?', [id]);
      persist();
      return all('SELECT * FROM school_years ORDER BY name DESC');
    });

    handle('classes:list', () => all(`
      SELECT c.*, y.name AS school_year
      FROM classes c
      LEFT JOIN school_years y ON y.id = c.school_year_id
      ORDER BY y.name DESC, c.name COLLATE NOCASE
    `));
    handle('classes:add', (_e, payload) => {
      const now = new Date().toISOString();
      const autoName = `Classe ${payload.level || ''} ${payload.teacher_name || ''}`.trim();
      const className = (payload.name || autoName || 'Classe').trim();
      insertAndGetId(
        'INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?)',
        [payload.school_year_id || null, className, payload.teacher_name || null, payload.level || null, now]
      );
      persist();
      return all('SELECT * FROM classes');
    });
    handle('classes:update', (_e, payload) => {
      const autoName = `Classe ${payload.level || ''} ${payload.teacher_name || ''}`.trim();
      const className = (payload.name || autoName || 'Classe').trim();
      run(
        'UPDATE classes SET school_year_id = ?, name = ?, teacher_name = ?, level = ? WHERE id = ?',
        [payload.school_year_id || null, className, payload.teacher_name || null, payload.level || null, payload.id]
      );
      persist();
      return all('SELECT * FROM classes');
    });
    handle('classes:delete', (_e, id) => {
      const usedBy = get('SELECT COUNT(*) AS c FROM students WHERE class_id = ?', [id]);
      if (usedBy && usedBy.c > 0) {
        throw new Error(`Cette classe contient encore ${usedBy.c} élève(s). Changez-les de classe ou supprimez-les d'abord.`);
      }
      run('DELETE FROM classes WHERE id = ?', [id]);
      persist();
      return all('SELECT * FROM classes');
    });
    handle('students:history', (_e, studentId) => {
      return all(`
        SELECT h.*, c.name AS class_name, c.teacher_name, c.level, y.name AS school_year
        FROM student_history h
        LEFT JOIN classes c ON c.id = h.class_id
        LEFT JOIN school_years y ON y.id = h.school_year_id
        WHERE h.student_id = ?
        ORDER BY h.start_date DESC
      `, [studentId]);
    });
    handle('years:close', (_e, payload) => {
      const now = new Date().toISOString();
      const currentYearId = payload.current_year_id;
      const nextName = payload.next_year_name;

      if (!currentYearId || !nextName) {
        throw new Error('Données manquantes pour clôturer l\'année.');
      }

      writeSafetyBackup('avant-cloture-annee');
      // Tout ou rien : une erreur au milieu ne laisse pas une annee a moitie cloturee.
      withTransaction(db, () => {
        const nextYear = get('SELECT id FROM school_years WHERE name = ?', [nextName]);
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
      });

      persist();
      return true;
    });
  handle('students:delete', (_e, id) => {
    const activeLoan = get('SELECT COUNT(*) AS c FROM loans WHERE student_id = ? AND return_date IS NULL', [id]);
    if (activeLoan && activeLoan.c > 0) {
      throw new Error('Impossible de supprimer cet élève : il a un ou plusieurs emprunts en cours. Enregistrez d\'abord leur retour.');
    }
    run('DELETE FROM students WHERE id = ?', [id]);
    persist();
    return listStudents();
  });

  handle('loans:list', () => listLoansActive());
  handle('loans:history', () => listLoansReturned());
  handle('loans:add', (_e, payload) => {
    const available = getAvailableCopies(payload.book_id);
    if (available <= 0) {
      throw new Error('Aucun exemplaire disponible pour ce livre.');
    }
    const now = new Date().toISOString();
    run(`
      INSERT INTO loans (book_id, student_id, loan_date, due_date, return_date)
      VALUES (?, ?, ?, ?, NULL)
    `, [payload.book_id, payload.student_id, now, payload.due_date || null]);
    persist();
    return listLoansActive();
  });
  handle('loans:return', (_e, id) => {
    run('UPDATE loans SET return_date = ? WHERE id = ? AND return_date IS NULL', [new Date().toISOString(), id]);
    persist();
    return listLoansActive();
  });
  handle('loans:returnByBook', (_e, payload) => {
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
    persist();
    return listLoansActive();
  });
  handle('loans:delete', (_e, id) => {
    run('DELETE FROM loans WHERE id = ?', [id]);
    persist();
    return listLoansActive();
  });

  handle('data:template', () => saveExcelTemplate());
  handle('import:pick', async (_e, options) => {
    const fromAutoBackups = !!(options && options.fromAutoBackups);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: fromAutoBackups ? 'Revenir à une sauvegarde automatique' : 'Importer ou restaurer',
      defaultPath: fromAutoBackups ? getBackupsDir() : app.getPath('documents'),
      properties: ['openFile'],
      filters: fromAutoBackups
        ? [{ name: 'Sauvegardes automatiques', extensions: ['json'] }]
        : [{ name: 'Sauvegardes et fichiers de données', extensions: ['json', 'xlsx', 'xls', 'sqlite3', 'db'] }]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }
    return runImportFile(result.filePaths[0]);
  });

  handle('data:exportCustom', (_e, options) => {
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

}

// Une seule fenetre a la fois : deux fenetres ouvertes sur la meme base
// s'ecraseraient mutuellement leurs modifications.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      const opened = await initDb();
      if (!opened) {
        app.quit();
        return;
      }
      setupIpc();
      createWindow();
      setupAutoUpdates();
    } catch (err) {
      logStartupError(err);
      dialog.showErrorBox(
        'Biblio-rians - Erreur au démarrage',
        `Une erreur a empêché le démarrage de l'application :\n\n${err && err.message ? err.message : err}\n\nDetails enregistrés dans error.log (dossier de données de l'application).`
      );
      app.quit();
    }
  });
}

app.on('before-quit', () => {
  flushAutoBackup();
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
