import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function resolveDbPath(): string {
  const configuredPath = process.env.FINANCE_DB_PATH?.trim();
  if (!configuredPath) {
    return path.join(process.cwd(), "data", "finance.db");
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

const DB_PATH = resolveDbPath();
const DB_DIR = path.dirname(DB_PATH);

type GlobalDb = typeof globalThis & {
  __finance_sqlite__?: Database.Database;
};

function createDatabase(): Database.Database {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  return db;
}

export function getDb(): Database.Database {
  const globalDb = globalThis as GlobalDb;
  if (!globalDb.__finance_sqlite__) {
    globalDb.__finance_sqlite__ = createDatabase();
  }
  return globalDb.__finance_sqlite__;
}

export const db = getDb();
export const DB_FILE_PATH = DB_PATH;
