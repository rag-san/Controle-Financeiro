import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import Database from "better-sqlite3";
import type { PoolClient, QueryResultRow } from "pg";
import { Pool } from "pg";

export type FinanceDbDialect = "postgres" | "sqlite";

type RunResult = {
  changes: number;
};

export type DbStatement = {
  all<T extends QueryResultRow = QueryResultRow>(...params: unknown[]): Promise<T[]>;
  get<T extends QueryResultRow = QueryResultRow>(...params: unknown[]): Promise<T | undefined>;
  run(...params: unknown[]): Promise<RunResult>;
};

export type FinanceDb = {
  readonly dialect: FinanceDbDialect;
  prepare(sql: string): DbStatement;
  exec(sql: string): Promise<void>;
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(run: () => Promise<T>): () => Promise<T>;
};

type GlobalDb = typeof globalThis & {
  __finance_pg_pool__?: Pool;
  __finance_sqlite__?: Database.Database;
  __finance_db_initialized__?: boolean;
  __finance_db_initializing__?: boolean;
};

type TxContext = {
  pgClient?: PoolClient;
  sqliteDepth: number;
};

const txStorage = new AsyncLocalStorage<TxContext>();

function resolvePostgresUrl(): string {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.FINANCE_DATABASE_URL?.trim() ||
    ""
  );
}

const POSTGRES_URL = resolvePostgresUrl();
const IS_VERCEL =
  process.env.VERCEL === "1" ||
  Boolean(process.env.VERCEL_ENV) ||
  Boolean(process.env.VERCEL_URL) ||
  Boolean(process.env.VERCEL_REGION);

function resolveDialect(): FinanceDbDialect {
  return "postgres";
}

function resolveSqlitePath(): string {
  const configuredPath = process.env.FINANCE_DB_PATH?.trim();
  if (!configuredPath) {
    return path.join(process.cwd(), "data", "finance.db");
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

const DIALECT = resolveDialect();
const SQLITE_DB_PATH = resolveSqlitePath();
const SQLITE_DB_DIR = path.dirname(SQLITE_DB_PATH);

function mapQuestionPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function normalizeSqlForPostgres(sql: string): string {
  let normalized = sql;
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(normalized)) {
    normalized = normalized.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");
    if (!/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(normalized)) {
      normalized = `${normalized.trim().replace(/;$/, "")} ON CONFLICT DO NOTHING`;
    }
  }
  return mapQuestionPlaceholders(normalized);
}

function createSqliteDatabase(): Database.Database {
  if (IS_VERCEL) {
    throw new Error(
      "PostgreSQL obrigatorio no Vercel. Configure DATABASE_URL (ou POSTGRES_URL) nas variaveis de ambiente."
    );
  }

  if (!fs.existsSync(SQLITE_DB_DIR)) {
    fs.mkdirSync(SQLITE_DB_DIR, { recursive: true });
  }

  const sqlite = new Database(SQLITE_DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

function getSqliteDatabase(): Database.Database {
  const globalDb = globalThis as GlobalDb;
  if (!globalDb.__finance_sqlite__) {
    globalDb.__finance_sqlite__ = createSqliteDatabase();
  }
  return globalDb.__finance_sqlite__;
}

function createPgPool(): Pool {
  if (!POSTGRES_URL) {
    throw new Error("DATABASE_URL nao configurada para PostgreSQL.");
  }

  const defaultPoolMax = IS_VERCEL ? 1 : 10;

  return new Pool({
    connectionString: POSTGRES_URL,
    max: Number(process.env.PG_POOL_MAX ?? defaultPoolMax),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 10_000)
  });
}

function getPgPool(): Pool {
  const globalDb = globalThis as GlobalDb;
  if (!globalDb.__finance_pg_pool__) {
    globalDb.__finance_pg_pool__ = createPgPool();
  }
  return globalDb.__finance_pg_pool__;
}

async function ensureDbInitialized(): Promise<void> {
  const globalDb = globalThis as GlobalDb;
  if (globalDb.__finance_db_initialized__ || globalDb.__finance_db_initializing__) {
    return;
  }

  const initModule = await import("./init");
  await initModule.initDbOnce();
}

async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const statement = normalizeSqlForPostgres(sql);
  const context = txStorage.getStore();
  const queryable = context?.pgClient ?? getPgPool();
  const result = await queryable.query<T>(statement, params as unknown[]);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? 0
  };
}

async function querySqlite<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const sqlite = getSqliteDatabase();
  const statement = sqlite.prepare(sql);
  const upper = sql.trim().toUpperCase();
  if (
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("PRAGMA") ||
    upper.startsWith("EXPLAIN")
  ) {
    const rows = statement.all(...params) as T[];
    return {
      rows,
      rowCount: rows.length
    };
  }

  const info = statement.run(...params);
  return {
    rows: [],
    rowCount: info.changes ?? 0
  };
}

async function queryInternal<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  await ensureDbInitialized();
  if (DIALECT === "postgres") {
    return queryPostgres<T>(sql, params);
  }
  return querySqlite<T>(sql, params);
}

let savepointCounter = 0;
function nextSavepointName(): string {
  savepointCounter += 1;
  return `sp_${savepointCounter}`;
}

async function withPgTransaction<T>(run: () => Promise<T>): Promise<T> {
  const current = txStorage.getStore();
  if (current?.pgClient) {
    const savepoint = nextSavepointName();
    await current.pgClient.query(`SAVEPOINT ${savepoint}`);
    try {
      const nestedResult = await run();
      await current.pgClient.query(`RELEASE SAVEPOINT ${savepoint}`);
      return nestedResult;
    } catch (error) {
      await current.pgClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      throw error;
    }
  }

  const client = await getPgPool().connect();
  try {
    await client.query("BEGIN");
    return await txStorage.run({ pgClient: client, sqliteDepth: 0 }, async () => {
      try {
        const result = await run();
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  } finally {
    client.release();
  }
}

async function withSqliteTransaction<T>(run: () => Promise<T>): Promise<T> {
  const sqlite = getSqliteDatabase();
  const current = txStorage.getStore();

  if (current && current.sqliteDepth > 0) {
    const savepoint = nextSavepointName();
    sqlite.exec(`SAVEPOINT ${savepoint}`);
    try {
      const nestedResult = await run();
      sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return nestedResult;
    } catch (error) {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      throw error;
    }
  }

  sqlite.exec("BEGIN");
  try {
    return await txStorage.run({ sqliteDepth: 1 }, async () => {
      try {
        const result = await run();
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    });
  } catch (error) {
    throw error;
  }
}

function createStatement(sql: string): DbStatement {
  return {
    async all<T extends QueryResultRow = QueryResultRow>(...params: unknown[]) {
      const result = await queryInternal<T>(sql, params);
      return result.rows;
    },
    async get<T extends QueryResultRow = QueryResultRow>(...params: unknown[]) {
      const result = await queryInternal<T>(sql, params);
      const first = result.rows[0];
      return first as T | undefined;
    },
    async run(...params: unknown[]) {
      const result = await queryInternal(sql, params);
      return { changes: result.rowCount };
    }
  };
}

export function getDb(): FinanceDb {
  return {
    dialect: DIALECT,
    prepare(sql: string): DbStatement {
      return createStatement(sql);
    },
    async exec(sql: string): Promise<void> {
      await ensureDbInitialized();
      if (DIALECT === "postgres") {
        await getPgPool().query(sql);
        return;
      }
      getSqliteDatabase().exec(sql);
    },
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: unknown[] = []
    ): Promise<{ rows: T[]; rowCount: number }> {
      return queryInternal<T>(sql, params);
    },
    transaction<T>(run: () => Promise<T>): () => Promise<T> {
      return async () => {
        await ensureDbInitialized();
        if (DIALECT === "postgres") {
          return withPgTransaction(run);
        }
        return withSqliteTransaction(run);
      };
    }
  };
}

export const db = getDb();
export const DB_FILE_PATH = DIALECT === "sqlite" ? SQLITE_DB_PATH : null;
