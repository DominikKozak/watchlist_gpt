import Database from "better-sqlite3";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? "./data/watchlist.sqlite";
}

export function createDb(dbPath = getDatabasePath()): Database.Database {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
