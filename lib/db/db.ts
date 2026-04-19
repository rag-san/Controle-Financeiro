import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient, QueryResultRow } from "pg";
import { Pool } from "pg";
import { normalizePostgresConnectionString } from "@/lib/db/postgres-url";

export type FinanceDbDialect = "postgres";

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
  __finance_db_initialized__?: boolean;
  __finance_db_initializing__?: boolean;
};

type TxContext = {
  pgClient?: PoolClient;
};

const txStorage = new AsyncLocalStorage<TxContext>();

type PgLikeError = Error & {
  code?: string;
  errno?: number;
  address?: string;
  port?: number;
};

function resolvePostgresUrl(): string {
  const configuredUrl =
    (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.FINANCE_DATABASE_URL?.trim() ||
    ""
    );

  return normalizePostgresConnectionString(configuredUrl);
}

const POSTGRES_URL = resolvePostgresUrl();
const IS_VERCEL =
  process.env.VERCEL === "1" ||
  Boolean(process.env.VERCEL_ENV) ||
  Boolean(process.env.VERCEL_URL) ||
  Boolean(process.env.VERCEL_REGION);

function describePostgresTarget(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname || "unknown-host";
    const port = parsed.port || "5432";
    const database = parsed.pathname.replace(/^\//, "") || "unknown-db";
    return `${host}:${port}/${database}`;
  } catch {
    return "target-unknown";
  }
}

function formatPgError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error("Falha inesperada ao conectar no PostgreSQL.");
  }

  const pgError = error as PgLikeError;
  const target = describePostgresTarget(POSTGRES_URL);
  const code = pgError.code ? ` codigo=${pgError.code}` : "";
  const address = pgError.address ? ` endereco=${pgError.address}` : "";
  const port = pgError.port ? ` porta=${pgError.port}` : "";

  if (pgError.code === "ECONNREFUSED") {
    return new Error(
      `Conexao com PostgreSQL recusada em ${target}.${address}${port}${code} Verifique se o servidor esta ativo e se DATABASE_URL/POSTGRES_URL apontam para a porta correta.`
    );
  }

  if (pgError.code === "ENOTFOUND") {
    return new Error(
      `Host do PostgreSQL nao encontrado para ${target}.${code} Revise DATABASE_URL/POSTGRES_URL.`
    );
  }

  if (pgError.code === "28P01") {
    return new Error(
      `Autenticacao no PostgreSQL falhou para ${target}.${code} Revise usuario e senha em DATABASE_URL/POSTGRES_URL.`
    );
  }

  if (pgError.code === "3D000") {
    return new Error(
      `Banco PostgreSQL nao encontrado em ${target}.${code} Revise o nome do database na URL de conexao.`
    );
  }

  if (pgError.message) {
    return new Error(`Falha no PostgreSQL (${target}): ${pgError.message}`);
  }

  return new Error(`Falha inesperada ao conectar no PostgreSQL (${target}).${code}`);
}

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

async function queryInternal<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  await ensureDbInitialized();
  const statement = normalizeSqlForPostgres(sql);
  const context = txStorage.getStore();
  const queryable = context?.pgClient ?? getPgPool();
  try {
    const result = await queryable.query<T>(statement, params as unknown[]);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0
    };
  } catch (error) {
    throw formatPgError(error);
  }
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

  let client: PoolClient | null = null;
  try {
    client = await getPgPool().connect();
    const connectedClient = client;
    await connectedClient.query("BEGIN");
    return await txStorage.run({ pgClient: connectedClient }, async () => {
      try {
        const result = await run();
        await connectedClient.query("COMMIT");
        return result;
      } catch (error) {
        await connectedClient.query("ROLLBACK");
        throw error;
      }
    });
  } catch (error) {
    throw formatPgError(error);
  } finally {
    client?.release();
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
      return result.rows[0] as T | undefined;
    },
    async run(...params: unknown[]) {
      const result = await queryInternal(sql, params);
      return { changes: result.rowCount };
    }
  };
}

function getDb(): FinanceDb {
  return {
    dialect: "postgres",
    prepare(sql: string): DbStatement {
      return createStatement(sql);
    },
    async exec(sql: string): Promise<void> {
      await queryInternal(sql);
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
        return withPgTransaction(run);
      };
    }
  };
}

export const db = getDb();
