'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { MIGRATIONS, getSchemaVersion, runMigrations } = require('../migrations');

async function makeDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });
  return new SQL.Database();
}

function tableNames(db) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const names = [];
  while (stmt.step()) names.push(stmt.getAsObject().name);
  stmt.free();
  return names;
}

function indexNames(db) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name");
  const names = [];
  while (stmt.step()) names.push(stmt.getAsObject().name);
  stmt.free();
  return names;
}

test('runMigrations creates every expected table on a fresh database', async () => {
  const db = await makeDb();
  runMigrations(db);
  const names = tableNames(db);
  ['books', 'classes', 'loans', 'school_years', 'student_history', 'students'].forEach((expected) => {
    assert.ok(names.includes(expected), `table ${expected} should exist`);
  });
});

test('runMigrations sets PRAGMA user_version to the number of migrations', async () => {
  const db = await makeDb();
  runMigrations(db);
  assert.equal(getSchemaVersion(db), MIGRATIONS.length);
});

test('runMigrations creates the foreign-key indexes', async () => {
  const db = await makeDb();
  runMigrations(db);
  const names = indexNames(db);
  ['idx_loans_book_id', 'idx_loans_student_id', 'idx_students_class_id', 'idx_classes_school_year_id', 'idx_student_history_student_id']
    .forEach((expected) => assert.ok(names.includes(expected), `index ${expected} should exist`));
});

test('runMigrations is idempotent: running it twice does not error and version stays stable', async () => {
  const db = await makeDb();
  runMigrations(db);
  const versionAfterFirst = getSchemaVersion(db);
  assert.doesNotThrow(() => runMigrations(db));
  assert.equal(getSchemaVersion(db), versionAfterFirst);
});

test('runMigrations preserves existing data when applied to an already-migrated database', async () => {
  const db = await makeDb();
  runMigrations(db);
  db.run(
    'INSERT INTO books (title, author, copies, created_at) VALUES (?, ?, ?, ?)',
    ['Le Petit Prince', 'Antoine de Saint-Exupery', 1, new Date().toISOString()]
  );
  runMigrations(db);
  const stmt = db.prepare('SELECT COUNT(*) AS c FROM books');
  stmt.step();
  const count = stmt.getAsObject().c;
  stmt.free();
  assert.equal(count, 1);
});
