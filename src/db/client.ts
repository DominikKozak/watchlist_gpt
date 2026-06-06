import Database from "better-sqlite3";
import { createClient, type Client } from "@libsql/client";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

export type DbProvider = "sqlite" | "turso";

export interface DbRunResult {
  lastInsertRowid?: number | bigint;
  rowsAffected?: number;
}

export interface AppDb {
  provider: DbProvider;
  exec(sql: string): Promise<void>;
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<DbRunResult>;
  close(): Promise<void>;
}

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? "./data/watchlist.sqlite";
}

export function getDbProvider(rawProvider = process.env.DB_PROVIDER ?? "sqlite"): DbProvider {
  const provider = rawProvider.trim().toLowerCase();
  if (provider === "sqlite" || provider === "turso") {
    return provider;
  }

  throw new Error(`Unsupported DB_PROVIDER="${rawProvider}". Use "sqlite" or "turso".`);
}

class SqliteAppDb implements AppDb {
  readonly provider = "sqlite" as const;

  constructor(private readonly db: Database.Database) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    const result = this.db.prepare(sql).run(...params);
    return { lastInsertRowid: result.lastInsertRowid, rowsAffected: result.changes };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

class TursoAppDb implements AppDb {
  readonly provider = "turso" as const;

  constructor(private readonly client: Client) {}

  async exec(sql: string): Promise<void> {
    await this.client.batch(
      sql
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => ({ sql: statement, args: [] })),
      "write",
    );
  }

  async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.execute({ sql, args: params as never[] });
    return result.rows as T[];
  }

  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.client.execute({ sql, args: params as never[] });
    return result.rows[0] as T | undefined;
  }

  async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    const result = await this.client.execute({ sql, args: params as never[] });
    return { lastInsertRowid: result.lastInsertRowid, rowsAffected: result.rowsAffected };
  }

  async close(): Promise<void> {
    this.client.close();
  }
}

export function createSqliteDb(dbPath = getDatabasePath()): AppDb {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return new SqliteAppDb(db);
}

export function createTursoDb(): AppDb {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DB_PROVIDER=turso requires TURSO_DATABASE_URL.");
  }

  return new TursoAppDb(
    createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
    }),
  );
}

export function createDb(dbPath?: string): AppDb {
  if (dbPath) {
    return createSqliteDb(dbPath);
  }

  return getDbProvider() === "turso" ? createTursoDb() : createSqliteDb();
}
