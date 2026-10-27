'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { runMigrations } = require('../migrations');
const { queryAll, queryGet } = require('../stats');
const {
  withTransaction,
  dumpDatabase,
  countDatabase,
  replaceAllData,
  mergeData,
  sheetsToData,
  buildBackupFile,
  parseBackupFile,
  isLibraryDatabase
} = require('../data-transfer');

let SQL;
async function makeDb() {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
    });
  }
  const db = new SQL.Database();
  runMigrations(db);
  db.run('PRAGMA foreign_keys = ON;');
  return db;
}

const NOW = '2026-01-10T10:00:00.000Z';

/* Fichier source dont les identifiants ont des "trous" (elements supprimes). */
function sourceWithGaps() {
  return {
    school_years: [{ id: 4, name: '2025-2026', created_at: NOW }],
    classes: [{ id: 7, school_year_id: 4, name: 'CE1 - Mme Dupont', teacher_name: 'Mme Dupont', level: 'CE1', created_at: NOW }],
    books: [
      { id: 1, title: 'Le Petit Prince', author: 'Saint-Exupery', copies: 1, numero: 'L-001', created_at: NOW },
      { id: 5, title: 'Matilda', author: 'Roald Dahl', copies: 2, numero: 'L-005', created_at: NOW }
    ],
    students: [
      { id: 3, class_id: 7, last_name: 'Martin', first_name: 'Lea', created_at: NOW },
      { id: 9, class_id: 7, last_name: 'Durand', first_name: 'Noah', created_at: NOW }
    ],
    student_history: [{ id: 2, student_id: 9, class_id: 7, school_year_id: 4, start_date: NOW, end_date: null }],
    loans: [{ id: 11, book_id: 5, student_id: 9, loan_date: NOW, due_date: null, return_date: null }]
  };
}

function loanLinks(db) {
  return queryAll(db, `
    SELECT b.title, s.last_name, s.first_name FROM loans l
    JOIN books b ON b.id = l.book_id JOIN students s ON s.id = l.student_id
    ORDER BY b.title`);
}

test('mergeData relie les prets au bon livre et au bon eleve meme si les identifiants different', async () => {
  const db = await makeDb();
  // La base locale a deja des lignes occupant les identifiants 1..9 : une reutilisation brute des ids du fichier se tromperait.
  for (let i = 1; i <= 9; i += 1) {
    db.run('INSERT INTO books (title, copies, created_at) VALUES (?, 1, ?)', [`Livre local ${i}`, NOW]);
    db.run('INSERT INTO students (last_name, first_name, created_at) VALUES (?, ?, ?)', [`Local${i}`, 'X', NOW]);
  }

  const report = mergeData(db, sourceWithGaps());

  assert.equal(report.books, 2);
  assert.equal(report.students, 2);
  assert.equal(report.loans, 1);
  assert.deepEqual(loanLinks(db), [{ title: 'Matilda', last_name: 'Durand', first_name: 'Noah' }]);
  const student = queryGet(db, `
    SELECT c.name AS class_name, y.name AS year FROM students s
    JOIN classes c ON c.id = s.class_id JOIN school_years y ON y.id = c.school_year_id
    WHERE s.last_name = 'Durand'`);
  assert.deepEqual(student, { class_name: 'CE1 - Mme Dupont', year: '2025-2026' });
});

test('mergeData ne cree pas de doublon quand on importe deux fois le meme fichier', async () => {
  const db = await makeDb();
  mergeData(db, sourceWithGaps());
  const before = countDatabase(db);
  const second = mergeData(db, sourceWithGaps());
  assert.deepEqual(countDatabase(db), before);
  assert.equal(second.books + second.students + second.classes + second.loans + second.student_history, 0);
});

test('mergeData ignore les prets dont l\'eleve est introuvable au lieu d\'inventer un eleve', async () => {
  const db = await makeDb();
  db.run('INSERT INTO books (title, copies, created_at) VALUES (?, 1, ?)', ['Matilda', NOW]);
  const report = mergeData(db, { loans: [{ book_title: 'Matilda', student_name: 'Inconnu Total', loan_date: NOW }] });
  assert.equal(report.loans, 0);
  assert.equal(report.skipped, 1);
  assert.equal(countDatabase(db).students, 0);
});

test('l\'export Excel de l\'application (une feuille, colonne dataset) se reimporte avec ses prets', async () => {
  const db = await makeDb();
  const sheets = {
    export: [
      { dataset: 'books', title: 'Le Petit Prince', author: 'Saint-Exupery', isbn: 9782070612758, copies: 1 },
      { dataset: 'students', student_name: 'Martin Lea', class_name: 'CE1', school_year: '2025-2026' },
      { dataset: 'loans', book_title: 'Le Petit Prince', student_name: 'Martin Lea', loan_date: NOW }
    ]
  };
  const data = sheetsToData(sheets);
  assert.equal(data.books.length, 1);
  assert.equal(data.books[0].dataset, undefined);

  const report = mergeData(db, data);
  assert.equal(report.books, 1);
  assert.equal(report.loans, 1, 'le pret doit etre retrouve meme sans auteur dans la ligne de pret');
  assert.equal(queryGet(db, 'SELECT isbn FROM books').isbn, '9782070612758', 'un ISBN numerique (Excel) est accepte');
});

test('replaceAllData restaure tout, y compris le numero des livres', async () => {
  const original = await makeDb();
  mergeData(original, sourceWithGaps());
  const dump = dumpDatabase(original);

  const target = await makeDb();
  target.run('INSERT INTO books (title, copies, created_at) VALUES (?, 1, ?)', ['A effacer', NOW]);
  replaceAllData(target, dump);

  assert.deepEqual(dumpDatabase(target), dump);
  assert.deepEqual(queryAll(target, 'SELECT numero FROM books ORDER BY numero'), [{ numero: 'L-001' }, { numero: 'L-005' }]);
});

test('replaceAllData ne modifie rien si la sauvegarde est invalide', async () => {
  const db = await makeDb();
  db.run('INSERT INTO books (title, copies, created_at) VALUES (?, 1, ?)', ['Mon livre', NOW]);
  const broken = { books: [{ id: 1, title: 'Un' }, { id: 1, title: 'Deux (meme id)' }] };

  assert.throws(() => replaceAllData(db, broken));
  assert.deepEqual(queryAll(db, 'SELECT title FROM books'), [{ title: 'Mon livre' }]);
});

test('replaceAllData ignore les prets orphelins au lieu d\'echouer', async () => {
  const db = await makeDb();
  const data = sourceWithGaps();
  data.loans.push({ id: 12, book_id: 999, student_id: 3, loan_date: NOW });
  const report = replaceAllData(db, data);
  assert.equal(report.skipped, 1);
  assert.equal(countDatabase(db).loans, 1);
});

test('withTransaction annule tout en cas d\'erreur', async () => {
  const db = await makeDb();
  assert.throws(() => withTransaction(db, () => {
    db.run('INSERT INTO books (title, copies, created_at) VALUES (?, 1, ?)', ['Temporaire', NOW]);
    throw new Error('panne');
  }), /panne/);
  assert.equal(countDatabase(db).books, 0);
});

test('isLibraryDatabase refuse une base qui n\'est pas une bibliotheque', async () => {
  await makeDb();
  const other = new SQL.Database();
  other.run('CREATE TABLE clients (id INTEGER)');
  assert.equal(isLibraryDatabase(other), false);
  assert.equal(isLibraryDatabase(await makeDb()), true);
});

test('parseBackupFile reconnait les differents types de fichiers', () => {
  const full = buildBackupFile({ appVersion: '0.2.0', libraries: [{ key: 'primaire', name: 'Primaire', data: { books: [] } }] });
  const parsedFull = parseBackupFile(JSON.parse(JSON.stringify(full)));
  assert.equal(parsedFull.kind, 'full');
  assert.equal(parsedFull.libraries[0].name, 'Primaire');

  const auto = { meta: { kind: 'auto-backup', library: 'maternelle' }, books: [] };
  assert.equal(parseBackupFile(auto).kind, 'single');
  assert.equal(parseBackupFile(auto).library, 'maternelle');

  const oldEncryptedBackup = { meta: { generated_at: NOW }, books: [] };
  assert.equal(parseBackupFile(oldEncryptedBackup, { trusted: true }).kind, 'single');
  assert.equal(parseBackupFile(oldEncryptedBackup), null, 'un export ordinaire se fusionne, il ne remplace rien');

  assert.throws(() => parseBackupFile({ meta: { format: 'biblio-rians-sauvegarde' } }), /incompl/);
});
