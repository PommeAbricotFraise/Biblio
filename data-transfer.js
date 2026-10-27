'use strict';

/*
 * Transferts de donnees : lecture complete d'une base, remplacement complet
 * (restauration d'une sauvegarde), fusion d'un fichier externe (import JSON ou
 * Excel) et format du fichier de sauvegarde "cle USB".
 *
 * Module independant d'Electron : ne prend qu'un objet base sql.js en
 * parametre, ce qui permet de le tester avec un simple `new SQL.Database()`.
 *
 * Regle importante de la fusion : les identifiants (id, book_id, student_id,
 * class_id...) venant d'un fichier ne sont JAMAIS reutilises tels quels dans la
 * base locale. Ils ne servent qu'a relier les lignes du fichier entre elles,
 * via des tables de correspondance "id du fichier -> id local".
 */
const { queryAll, queryGet } = require('./stats');

const TABLES = ['school_years', 'classes', 'books', 'students', 'student_history', 'loans'];
const BACKUP_FORMAT = 'biblio-rians-sauvegarde';
const BACKUP_FORMAT_VERSION = 1;
const AUTO_BACKUP_KIND = 'auto-backup';

function runSql(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) { /* consommer le resultat */ }
  } finally {
    stmt.free();
  }
}

function insertAndGetId(db, sql, params = []) {
  runSql(db, sql, params);
  const row = queryGet(db, 'SELECT last_insert_rowid() AS id');
  return row ? row.id : null;
}

/*
 * Execute fn dans une transaction : soit tout est applique, soit rien.
 * Attention : ne jamais appeler db.export() a l'interieur, sql.js ferme et
 * rouvre la connexion lors d'un export, ce qui annule la transaction.
 */
function withTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) { /* transaction deja terminee */ }
    throw err;
  }
}

function text(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function textOrNull(value) {
  const clean = text(value);
  return clean || null;
}

function intOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function idKey(value) {
  return value === undefined || value === null || value === '' ? null : String(value);
}

function tableExists(db, table) {
  return !!queryGet(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
}

function columnNames(db, table) {
  return queryAll(db, `PRAGMA table_info(${table})`).map((c) => c.name);
}

/* Une base Biblio-rians contient au minimum la table des livres. */
function isLibraryDatabase(db) {
  return tableExists(db, 'books');
}

function dumpDatabase(db) {
  const out = {};
  TABLES.forEach((table) => {
    out[table] = tableExists(db, table) ? queryAll(db, `SELECT * FROM ${table}`) : [];
  });
  return out;
}

function countData(data) {
  const source = data || {};
  const len = (key) => (Array.isArray(source[key]) ? source[key].length : 0);
  return {
    books: len('books'),
    students: len('students'),
    classes: len('classes'),
    school_years: len('school_years'),
    loans: len('loans'),
    student_history: len('student_history')
  };
}

function countDatabase(db) {
  const count = (table) => {
    if (!tableExists(db, table)) return 0;
    const row = queryGet(db, `SELECT COUNT(*) AS c FROM ${table}`);
    return row ? Number(row.c || 0) : 0;
  };
  const out = {};
  TABLES.forEach((table) => { out[table] = count(table); });
  return out;
}

function isDatabaseEmpty(db) {
  const counts = countDatabase(db);
  return TABLES.every((table) => counts[table] === 0);
}

function describeCounts(counts) {
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  return [
    plural(counts.books || 0, 'livre', 'livres'),
    plural(counts.students || 0, 'élève', 'élèves'),
    plural(counts.classes || 0, 'classe', 'classes'),
    plural(counts.loans || 0, 'prêt', 'prêts')
  ].join(', ');
}

/*
 * Remplace TOUT le contenu de la base par `data` (restauration d'une
 * sauvegarde). Les identifiants sont conserves pour garder les liens entre
 * tables. Les lignes orphelines (pret dont le livre n'existe plus...) sont
 * ignorees au lieu de faire echouer toute la restauration. En cas d'erreur,
 * rien n'est modifie.
 */
function replaceAllData(db, data) {
  const source = data || {};
  const rows = (key) => (Array.isArray(source[key]) ? source[key] : []);
  const now = new Date().toISOString();
  const studentColumns = columnNames(db, 'students');
  const hasLegacyName = studentColumns.includes('name');
  const report = { skipped: 0 };

  withTransaction(db, () => {
    ['loans', 'student_history', 'students', 'classes', 'school_years', 'books'].forEach((table) => {
      runSql(db, `DELETE FROM ${table}`);
    });

    const yearIds = new Set();
    rows('school_years').forEach((y) => {
      const name = text(y.name);
      if (!name) { report.skipped += 1; return; }
      const id = insertAndGetId(db, 'INSERT INTO school_years (id, name, created_at) VALUES (?, ?, ?)',
        [intOrNull(y.id), name, y.created_at || now]);
      yearIds.add(id);
    });

    const classIds = new Set();
    rows('classes').forEach((c) => {
      const yearId = intOrNull(c.school_year_id);
      const id = insertAndGetId(db,
        'INSERT INTO classes (id, school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [intOrNull(c.id), yearIds.has(yearId) ? yearId : null, text(c.name) || 'Classe',
          textOrNull(c.teacher_name), textOrNull(c.level), c.created_at || now]);
      classIds.add(id);
    });

    const bookIds = new Set();
    rows('books').forEach((b) => {
      const copies = intOrNull(b.copies);
      const id = insertAndGetId(db,
        'INSERT INTO books (id, isbn, title, author, year, copies, numero, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [intOrNull(b.id), textOrNull(b.isbn), text(b.title) || 'Sans titre', textOrNull(b.author), intOrNull(b.year),
          copies && copies > 0 ? copies : 1, textOrNull(b.numero), textOrNull(b.location), b.created_at || now]);
      bookIds.add(id);
    });

    const studentIds = new Set();
    rows('students').forEach((s) => {
      const classId = intOrNull(s.class_id);
      const lastName = textOrNull(s.last_name);
      const firstName = textOrNull(s.first_name);
      const columns = ['id', 'class_id', 'last_name', 'first_name', 'birth_year', 'created_at'];
      const values = [intOrNull(s.id), classIds.has(classId) ? classId : null, lastName, firstName,
        intOrNull(s.birth_year), s.created_at || now];
      if (hasLegacyName) {
        columns.push('name');
        values.push(text(s.name) || `${lastName || ''} ${firstName || ''}`.trim());
      }
      const id = insertAndGetId(db,
        `INSERT INTO students (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
      studentIds.add(id);
    });

    rows('student_history').forEach((h) => {
      const studentId = intOrNull(h.student_id);
      if (!studentIds.has(studentId)) { report.skipped += 1; return; }
      const classId = intOrNull(h.class_id);
      const yearId = intOrNull(h.school_year_id);
      runSql(db,
        'INSERT INTO student_history (id, student_id, class_id, school_year_id, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
        [intOrNull(h.id), studentId, classIds.has(classId) ? classId : null, yearIds.has(yearId) ? yearId : null,
          h.start_date || now, h.end_date || null]);
    });

    rows('loans').forEach((l) => {
      const bookId = intOrNull(l.book_id);
      const studentId = intOrNull(l.student_id);
      if (!bookIds.has(bookId) || !studentIds.has(studentId)) { report.skipped += 1; return; }
      runSql(db,
        'INSERT INTO loans (id, book_id, student_id, loan_date, due_date, return_date) VALUES (?, ?, ?, ?, ?, ?)',
        [intOrNull(l.id), bookId, studentId, l.loan_date || now, l.due_date || null, l.return_date || null]);
    });
  });

  return report;
}

function normalizeSheetName(name) {
  const key = String(name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_');
  if (TABLES.includes(key)) return key;
  if (key.includes('annee')) return 'school_years';
  if (key.includes('historique')) return 'student_history';
  if (key.includes('emprunt') || key.includes('pret')) return 'loans';
  if (key.includes('eleve')) return 'students';
  if (key.includes('classe')) return 'classes';
  if (key.includes('livre')) return 'books';
  return key;
}

/*
 * Transforme les feuilles d'un classeur ({ nomFeuille: lignes }) en jeux de
 * donnees. L'export Excel de l'application met tout dans une seule feuille
 * avec une colonne "dataset" : on la redistribue.
 */
function sheetsToData(sheets) {
  const out = {};
  const push = (key, row) => {
    if (!out[key]) out[key] = [];
    out[key].push(row);
  };
  Object.entries(sheets || {}).forEach(([sheetName, rows]) => {
    const fallbackKey = normalizeSheetName(sheetName);
    (rows || []).forEach((row) => {
      if (row && row.dataset) {
        const { dataset, ...rest } = row;
        push(normalizeSheetName(dataset), rest);
      } else {
        push(fallbackKey, row);
      }
    });
  });
  return out;
}

/*
 * Ajoute le contenu de `data` a la base sans doublon. Retourne un compte rendu
 * du nombre d'elements ajoutes et de lignes ignorees.
 */
function mergeData(db, data, datasets = TABLES) {
  const source = data || {};
  const rows = (key) => (Array.isArray(source[key]) ? source[key] : []);
  const want = (key) => datasets.includes(key);
  const now = new Date().toISOString();
  const report = { books: 0, students: 0, classes: 0, school_years: 0, loans: 0, student_history: 0, skipped: 0 };
  const hasLegacyName = columnNames(db, 'students').includes('name');

  const yearMap = new Map();
  const classMap = new Map();
  const bookMap = new Map();
  const studentMap = new Map();

  function getOrCreateYear(name) {
    const clean = text(name);
    if (!clean) return null;
    const existing = queryGet(db, 'SELECT id FROM school_years WHERE name = ?', [clean]);
    if (existing) return existing.id;
    report.school_years += 1;
    return insertAndGetId(db, 'INSERT INTO school_years (name, created_at) VALUES (?, ?)', [clean, now]);
  }

  function resolveYearId(row) {
    const mapped = yearMap.get(idKey(row.school_year_id));
    if (mapped) return mapped;
    return row.school_year ? getOrCreateYear(row.school_year) : null;
  }

  function getOrCreateClass(row, name) {
    const yearId = resolveYearId(row);
    const existing = queryGet(db, 'SELECT id FROM classes WHERE name = ? AND school_year_id IS ?', [name, yearId]);
    if (existing) return existing.id;
    report.classes += 1;
    return insertAndGetId(db,
      'INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (?, ?, ?, ?, ?)',
      [yearId, name, textOrNull(row.teacher_name), textOrNull(row.level), now]);
  }

  /* Classe d'un eleve, d'un historique : jamais via la colonne "name" (nom de l'eleve). */
  function resolveClassId(row) {
    const mapped = classMap.get(idKey(row.class_id));
    if (mapped) return mapped;
    const name = text(row.class_name) || text(row.class);
    return name ? getOrCreateClass(row, name) : null;
  }

  function findBook(row) {
    const isbn = text(row.isbn);
    if (isbn) {
      const byIsbn = queryGet(db, 'SELECT id FROM books WHERE isbn = ?', [isbn]);
      if (byIsbn) return byIsbn.id;
    }
    const title = text(row.title) || text(row.book_title);
    if (!title) return null;
    const author = text(row.author);
    if (author) {
      const exact = queryGet(db,
        "SELECT id FROM books WHERE title = ? COLLATE NOCASE AND COALESCE(author, '') = ? COLLATE NOCASE", [title, author]);
      return exact ? exact.id : null;
    }
    const matches = queryAll(db, 'SELECT id FROM books WHERE title = ? COLLATE NOCASE LIMIT 2', [title]);
    return matches.length === 1 ? matches[0].id : null;
  }

  function splitNames(row) {
    let lastName = text(row.last_name);
    let firstName = text(row.first_name);
    if (!lastName && !firstName && text(row.student_name)) {
      const parts = text(row.student_name).split(/\s+/);
      lastName = parts.shift() || '';
      firstName = parts.join(' ');
    }
    return { lastName, firstName };
  }

  function findStudent(row, classId) {
    const mapped = studentMap.get(idKey(row.student_id));
    if (mapped) return mapped;
    const classFilter = classId ? ' AND class_id = ?' : '';
    const classParams = classId ? [classId] : [];
    const fullName = text(row.student_name);
    let matches = [];
    if (text(row.last_name) || text(row.first_name)) {
      const { lastName, firstName } = splitNames(row);
      matches = queryAll(db,
        `SELECT id FROM students WHERE COALESCE(last_name, '') = ? COLLATE NOCASE AND COALESCE(first_name, '') = ? COLLATE NOCASE${classFilter} LIMIT 2`,
        [lastName, firstName, ...classParams]);
    } else if (fullName) {
      matches = queryAll(db,
        `SELECT id FROM students WHERE TRIM(COALESCE(last_name, '') || ' ' || COALESCE(first_name, '')) = ? COLLATE NOCASE${classFilter} LIMIT 2`,
        [fullName, ...classParams]);
    }
    return matches.length === 1 ? matches[0].id : null;
  }

  withTransaction(db, () => {
    rows('school_years').forEach((y) => {
      const name = text(y.name);
      if (!name) return;
      const existing = queryGet(db, 'SELECT id FROM school_years WHERE name = ?', [name]);
      const id = existing ? existing.id : (want('school_years') ? getOrCreateYear(name) : null);
      if (id && idKey(y.id)) yearMap.set(idKey(y.id), id);
    });

    rows('classes').forEach((c) => {
      const name = text(c.name) || text(c.class_name) || `Classe ${text(c.level)} ${text(c.teacher_name)}`.trim();
      if (!want('classes')) return;
      const id = getOrCreateClass(c, name);
      if (id && idKey(c.id)) classMap.set(idKey(c.id), id);
    });

    rows('books').forEach((b) => {
      let id = findBook(b);
      if (!id && want('books')) {
        const title = text(b.title) || text(b.book_title);
        if (!title) { report.skipped += 1; return; }
        const copies = intOrNull(b.copies);
        id = insertAndGetId(db,
          'INSERT INTO books (isbn, title, author, year, copies, numero, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [textOrNull(b.isbn), title, textOrNull(b.author), intOrNull(b.year), copies && copies > 0 ? copies : 1,
            textOrNull(b.numero), textOrNull(b.location), b.created_at || now]);
        report.books += 1;
      }
      if (id && idKey(b.id)) bookMap.set(idKey(b.id), id);
    });

    rows('students').forEach((s) => {
      const { lastName, firstName } = splitNames(s);
      if (!lastName && !firstName) { report.skipped += 1; return; }
      const classId = resolveClassId(s);
      const existing = queryGet(db,
        "SELECT id FROM students WHERE COALESCE(last_name, '') = ? COLLATE NOCASE AND COALESCE(first_name, '') = ? COLLATE NOCASE AND class_id IS ?",
        [lastName, firstName, classId]);
      let id = existing ? existing.id : null;
      if (!id && want('students')) {
        const columns = ['class_id', 'last_name', 'first_name', 'birth_year', 'created_at'];
        const values = [classId, lastName || null, firstName || null, intOrNull(s.birth_year), s.created_at || now];
        if (hasLegacyName) {
          columns.push('name');
          values.push(`${lastName} ${firstName}`.trim());
        }
        id = insertAndGetId(db,
          `INSERT INTO students (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
        report.students += 1;
      }
      if (id && idKey(s.id)) studentMap.set(idKey(s.id), id);
    });

    if (want('student_history')) {
      rows('student_history').forEach((h) => {
        const studentId = findStudent(h, null);
        if (!studentId) { report.skipped += 1; return; }
        const classId = resolveClassId(h);
        const startDate = h.start_date || now;
        const existing = queryGet(db,
          'SELECT id FROM student_history WHERE student_id = ? AND class_id IS ? AND start_date = ?',
          [studentId, classId, startDate]);
        if (existing) return;
        let yearId = resolveYearId(h);
        if (!yearId && classId) {
          const cls = queryGet(db, 'SELECT school_year_id FROM classes WHERE id = ?', [classId]);
          yearId = cls ? cls.school_year_id : null;
        }
        runSql(db,
          'INSERT INTO student_history (student_id, class_id, school_year_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
          [studentId, classId, yearId, startDate, h.end_date || null]);
        report.student_history += 1;
      });
    }

    if (want('loans')) {
      rows('loans').forEach((l) => {
        const bookId = bookMap.get(idKey(l.book_id)) || findBook(l);
        const studentId = findStudent(l, null);
        if (!bookId || !studentId) { report.skipped += 1; return; }
        const loanDate = l.loan_date || now;
        const existing = queryGet(db,
          'SELECT id FROM loans WHERE book_id = ? AND student_id = ? AND loan_date = ?', [bookId, studentId, loanDate]);
        if (existing) return;
        runSql(db,
          'INSERT INTO loans (book_id, student_id, loan_date, due_date, return_date) VALUES (?, ?, ?, ?, ?)',
          [bookId, studentId, loanDate, l.due_date || null, l.return_date || null]);
        report.loans += 1;
      });
    }
  });

  return report;
}

/* Fichier de sauvegarde "cle USB" : toutes les bibliotheques, en clair. */
function buildBackupFile({ appVersion, libraries, generatedAt }) {
  return {
    meta: {
      format: BACKUP_FORMAT,
      format_version: BACKUP_FORMAT_VERSION,
      app_version: appVersion || null,
      generated_at: generatedAt || new Date().toISOString()
    },
    libraries: (libraries || []).map((lib) => ({ key: lib.key, name: lib.name, data: lib.data }))
  };
}

/*
 * Reconnait le contenu d'un fichier :
 *  - { kind: 'full' }   sauvegarde "cle USB" (une ou plusieurs bibliotheques)
 *  - { kind: 'single' } sauvegarde automatique d'une bibliotheque
 *  - null               fichier ordinaire (export), a fusionner
 * `trusted` indique un fichier chiffre par l'application (donc une sauvegarde
 * automatique, meme ancienne et sans marqueur).
 */
function parseBackupFile(obj, { trusted = false } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const meta = obj.meta && typeof obj.meta === 'object' ? obj.meta : {};
  if (meta.format === BACKUP_FORMAT) {
    if (!Array.isArray(obj.libraries)) {
      throw new Error('Cette sauvegarde est incomplète ou abîmée.');
    }
    const libraries = obj.libraries
      .filter((lib) => lib && typeof lib === 'object' && lib.data && typeof lib.data === 'object')
      .map((lib) => ({ key: text(lib.key), name: text(lib.name) || text(lib.key), data: lib.data }));
    return { kind: 'full', generatedAt: meta.generated_at || null, libraries };
  }
  const looksLikeDump = TABLES.some((table) => Array.isArray(obj[table]));
  if (looksLikeDump && (meta.kind === AUTO_BACKUP_KIND || trusted)) {
    return {
      kind: 'single',
      generatedAt: meta.generated_at || null,
      library: meta.library || null,
      libraryName: meta.library_name || null,
      data: obj
    };
  }
  return null;
}

module.exports = {
  TABLES,
  BACKUP_FORMAT,
  AUTO_BACKUP_KIND,
  runSql,
  withTransaction,
  isLibraryDatabase,
  dumpDatabase,
  countData,
  countDatabase,
  isDatabaseEmpty,
  describeCounts,
  replaceAllData,
  normalizeSheetName,
  sheetsToData,
  mergeData,
  buildBackupFile,
  parseBackupFile
};
