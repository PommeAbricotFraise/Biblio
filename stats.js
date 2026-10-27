'use strict';

/*
 * Calcul des statistiques simples de la bibliotheque. Module independant
 * d'Electron : ne prend qu'un objet base sql.js en parametre, ce qui permet
 * de le tester avec un simple `new SQL.Database()` en memoire.
 */

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryGet(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows[0];
}

function countRows(db, table) {
  const row = queryGet(db, `SELECT COUNT(*) AS c FROM ${table}`);
  return row ? Number(row.c || 0) : 0;
}

/* Date du jour locale (AAAA-MM-JJ) : un livre a rendre aujourd'hui n'est pas encore en retard. */
function localToday(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getStatistics(db, today = localToday()) {
  const topBooks = queryAll(db, `
    SELECT b.id, b.title, b.author, COUNT(l.id) AS loan_count
    FROM loans l
    JOIN books b ON b.id = l.book_id
    GROUP BY b.id
    ORDER BY loan_count DESC, b.title COLLATE NOCASE
    LIMIT 5
  `);
  const topClasses = queryAll(db, `
    SELECT c.id, c.name, c.teacher_name, y.name AS school_year, COUNT(l.id) AS loan_count
    FROM loans l
    JOIN students s ON s.id = l.student_id
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN school_years y ON y.id = c.school_year_id
    GROUP BY c.id
    ORDER BY loan_count DESC, c.name COLLATE NOCASE
    LIMIT 5
  `);
  const totals = queryGet(db, 'SELECT COUNT(*) AS c FROM loans');
  const active = queryGet(db, 'SELECT COUNT(*) AS c FROM loans WHERE return_date IS NULL');
  const overdue = queryGet(
    db,
    'SELECT COUNT(*) AS c FROM loans WHERE return_date IS NULL AND due_date IS NOT NULL AND substr(due_date, 1, 10) < ?',
    [today]
  );
  const neverBorrowed = queryGet(db, `
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
    booksTotal: countRows(db, 'books'),
    studentsTotal: countRows(db, 'students')
  };
}

module.exports = { getStatistics, localToday, queryAll, queryGet, countRows };
