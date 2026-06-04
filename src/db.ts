import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";

export async function initDB() {
  const databasePath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "database.sqlite");
  const databaseDir = path.dirname(databasePath);

  fs.mkdirSync(databaseDir, { recursive: true });

  const db = await open({
    filename: databasePath,
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);
await db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);
await db.exec(`
  CREATE TABLE IF NOT EXISTS score (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    skill_type TEXT NOT NULL,
    test_name TEXT NOT NULL,
    tested_data DATE,
    testing_date DATETIME NOT NULL,
    correct_score INTEGER NOT NULL,
    attempt_score INTEGER NOT NULL,
    total INTEGER,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const scoreColumns = await db.all(
  "PRAGMA table_info(score)"
);
const hasTestedData =
  scoreColumns.some((column) => column.name === "tested_data");

if (!hasTestedData) {
  await db.exec(`
    ALTER TABLE score
    ADD COLUMN tested_data DATE
  `);
}

  return db;
}
