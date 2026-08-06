'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { runMigrations } = require('../migrations');
const { getStatistics } = require('../stats');

async function makeSeededDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });
  const db = new SQL.Database();
  runMigrations(db);

  const now = new Date().toISOString();
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  db.run('INSERT INTO school_years (name, created_at) VALUES (?, ?)', ['2025-2026', now]);
  db.run('INSERT INTO classes (school_year_id, name, teacher_name, level, created_at) VALUES (1, ?, ?, ?, ?)', ['CE1 - Mme Dupont', 'Mme Dupont', 'CE1', now]);
  db.run('INSERT INTO students (class_id, last_name, first_name, created_at) VALUES (1, ?, ?, ?)', ['Martin', 'Lea', now]);
  db.run('INSERT INTO students (class_id, last_name, first_name, created_at) VALUES (1, ?, ?, ?)', ['Durand', 'Noah', now]);

  db.run('INSERT INTO books (title, author, copies, created_at) VALUES (?, ?, 2, ?)', ['Le Petit Prince', 'Saint-Exupery', now]);
  db.run('INSERT INTO books (title, author, copies, created_at) VALUES (?, ?, 1, ?)', ['Jamais Emprunte', 'Personne', now]);

  // Le Petit Prince emprunte deux fois (une fois rendu, une fois en cours et en retard)
  db.run('INSERT INTO loans (book_id, student_id, loan_date, due_date, return_date) VALUES (1, 1, ?, ?, ?)', [past, past, now]);
  db.run('INSERT INTO loans (book_id, student_id, loan_date, due_date, return_date) VALUES (1, 2, ?, ?, NULL)', [past, past]);

  return db;
}

test('getStatistics counts totals correctly', async () => {
  const db = await makeSeededDb();
  const stats = getStatistics(db);
  assert.equal(stats.totalLoans, 2);
  assert.equal(stats.activeLoans, 1);
  assert.equal(stats.overdueLoans, 1);
  assert.equal(stats.booksTotal, 2);
  assert.equal(stats.studentsTotal, 2);
});

test('getStatistics finds the never-borrowed book', async () => {
  const db = await makeSeededDb();
  const stats = getStatistics(db);
  assert.equal(stats.booksNeverBorrowed, 1);
});

test('getStatistics ranks the most-borrowed book first', async () => {
  const db = await makeSeededDb();
  const stats = getStatistics(db);
  assert.equal(stats.topBooks.length, 1);
  assert.equal(stats.topBooks[0].title, 'Le Petit Prince');
  assert.equal(stats.topBooks[0].loan_count, 2);
});

test('getStatistics ranks the most active class', async () => {
  const db = await makeSeededDb();
  const stats = getStatistics(db);
  assert.equal(stats.topClasses.length, 1);
  assert.equal(stats.topClasses[0].name, 'CE1 - Mme Dupont');
  assert.equal(stats.topClasses[0].loan_count, 2);
});

test('getStatistics on an empty database returns zeros without throwing', async () => {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });
  const db = new SQL.Database();
  runMigrations(db);
  const stats = getStatistics(db);
  assert.equal(stats.totalLoans, 0);
  assert.equal(stats.topBooks.length, 0);
  assert.equal(stats.topClasses.length, 0);
});
