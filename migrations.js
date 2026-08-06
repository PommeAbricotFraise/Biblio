'use strict';

/*
 * Migrations de schema versionnees. Chaque entree est appliquee une seule fois,
 * dans l'ordre, en s'appuyant sur PRAGMA user_version (entier stocke nativement
 * dans le fichier SQLite). Toujours ajouter de nouvelles migrations a la fin du
 * tableau, jamais modifier ou reordonner les entrees existantes.
 *
 * Module independant d'Electron : ne prend qu'un objet base sql.js en parametre,
 * ce qui permet de le tester avec un simple `new SQL.Database()` en memoire.
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
  },
  // v3 : index sur les colonnes de jointure les plus utilisees
  (database) => {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_loans_book_id ON loans(book_id);
      CREATE INDEX IF NOT EXISTS idx_loans_student_id ON loans(student_id);
      CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
      CREATE INDEX IF NOT EXISTS idx_classes_school_year_id ON classes(school_year_id);
      CREATE INDEX IF NOT EXISTS idx_student_history_student_id ON student_history(student_id);
    `);
  }
];

function getSchemaVersion(db) {
  const result = db.exec('PRAGMA user_version');
  if (result.length && result[0].values.length) {
    return Number(result[0].values[0][0]) || 0;
  }
  return 0;
}

function setSchemaVersion(db, v) {
  db.run(`PRAGMA user_version = ${Number(v)}`);
}

function runMigrations(db) {
  const current = getSchemaVersion(db);
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    MIGRATIONS[v](db);
    setSchemaVersion(db, v + 1);
  }
  return getSchemaVersion(db);
}

module.exports = { MIGRATIONS, getSchemaVersion, setSchemaVersion, runMigrations };
