import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { Pool, type PoolClient } from "pg";

type TableCopyConfig = {
  table: string;
  columns: string[];
  postInsertUpdate?: {
    column: string;
    idColumn: string;
    nullable: boolean;
  };
};

const COPY_ORDER: TableCopyConfig[] = [
  {
    table: "users",
    columns: ["id", "email", "name", "password", "role", "created_at", "updated_at"]
  },
  {
    table: "accounts",
    columns: [
      "id",
      "user_id",
      "name",
      "type",
      "institution",
      "currency",
      "parent_account_id",
      "created_at",
      "updated_at"
    ],
    postInsertUpdate: {
      column: "parent_account_id",
      idColumn: "id",
      nullable: true
    }
  },
  {
    table: "categories",
    columns: ["id", "user_id", "name", "color", "icon", "parent_id", "created_at", "updated_at"],
    postInsertUpdate: {
      column: "parent_id",
      idColumn: "id",
      nullable: true
    }
  },
  {
    table: "import_batches",
    columns: [
      "id",
      "user_id",
      "source",
      "file_name",
      "mapping_json",
      "total_imported",
      "total_skipped",
      "imported_at",
      "created_at",
      "updated_at"
    ]
  },
  {
    table: "import_events",
    columns: [
      "id",
      "user_id",
      "source_type",
      "event",
      "phase",
      "error_code",
      "total_rows",
      "valid_rows",
      "ignored_rows",
      "error_rows",
      "imported",
      "skipped",
      "duplicates",
      "invalid_rows",
      "transfer_created",
      "card_payment_detected",
      "card_payment_not_converted",
      "created_at"
    ]
  },
  {
    table: "official_metric_snapshots",
    columns: [
      "id",
      "user_id",
      "metric_key",
      "period_key",
      "payload_json",
      "created_at",
      "updated_at"
    ]
  },
  {
    table: "transactions",
    columns: [
      "id",
      "user_id",
      "account_id",
      "category_id",
      "import_batch_id",
      "posted_at",
      "description",
      "normalized_description",
      "amount_cents",
      "currency",
      "type",
      "status",
      "account",
      "bank",
      "external_id",
      "imported_hash",
      "transfer_group_id",
      "transfer_peer_tx_id",
      "raw_json",
      "created_at",
      "updated_at"
    ],
    postInsertUpdate: {
      column: "transfer_peer_tx_id",
      idColumn: "id",
      nullable: true
    }
  },
  {
    table: "import_items",
    columns: ["id", "user_id", "batch_id", "tx_id", "created_at"]
  },
  {
    table: "recurring_items",
    columns: [
      "id",
      "user_id",
      "name",
      "amount_cents",
      "due_day",
      "category_id",
      "status",
      "last_paid_at",
      "created_at",
      "updated_at"
    ]
  },
  {
    table: "net_worth_entries",
    columns: [
      "id",
      "user_id",
      "type",
      "name",
      "value_cents",
      "date_iso",
      "group_name",
      "created_at",
      "updated_at"
    ]
  },
  {
    table: "category_rules",
    columns: [
      "id",
      "user_id",
      "name",
      "priority",
      "enabled",
      "match_type",
      "pattern",
      "account_id",
      "min_amount_cents",
      "max_amount_cents",
      "category_id",
      "created_at",
      "updated_at"
    ]
  }
];

const RESET_ORDER = [...COPY_ORDER].reverse().map((item) => item.table);
const CHUNK_SIZE = 400;

function resolveSqlitePath(): string {
  const configured = process.env.SOURCE_SQLITE_PATH?.trim() || process.env.FINANCE_DB_PATH?.trim();
  if (!configured) {
    return path.join(process.cwd(), "data", "finance.db");
  }
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function readFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "sim";
}

function buildMultiInsertSql(table: string, columns: string[], rowCount: number): string {
  const placeholders: string[] = [];
  let valueIndex = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowPlaceholders: string[] = [];
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      valueIndex += 1;
      rowPlaceholders.push(`$${valueIndex}`);
    }
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  }

  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`;
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function normalizeRowValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function copyTableData(input: {
  sqlite: Database.Database;
  pgClient: PoolClient;
  config: TableCopyConfig;
}): Promise<{ copied: number; updated: number }> {
  const { sqlite, pgClient, config } = input;
  const selectSql = `SELECT ${config.columns.join(", ")} FROM ${config.table}`;
  const sqliteRows = sqlite.prepare(selectSql).all() as Array<Record<string, unknown>>;
  if (sqliteRows.length === 0) {
    return { copied: 0, updated: 0 };
  }

  const postUpdateValues: Array<{ id: string; value: string | null }> = [];
  const rowsForInsert = sqliteRows.map((row) => {
    const copy = { ...row };
    if (config.postInsertUpdate) {
      const rawId = copy[config.postInsertUpdate.idColumn];
      const rawValue = copy[config.postInsertUpdate.column];
      if (typeof rawId === "string") {
        postUpdateValues.push({
          id: rawId,
          value: typeof rawValue === "string" ? rawValue : null
        });
      }
      copy[config.postInsertUpdate.column] = null;
    }
    return copy;
  });

  let copied = 0;
  for (const chunk of chunkRows(rowsForInsert, CHUNK_SIZE)) {
    const sql = buildMultiInsertSql(config.table, config.columns, chunk.length);
    const values: unknown[] = [];
    for (const row of chunk) {
      for (const column of config.columns) {
        values.push(normalizeRowValue(row[column]));
      }
    }
    const result = await pgClient.query(sql, values);
    copied += result.rowCount ?? 0;
  }

  if (!config.postInsertUpdate) {
    return { copied, updated: 0 };
  }

  let updated = 0;
  const updateSql = `UPDATE ${config.table} SET ${config.postInsertUpdate.column} = $1 WHERE ${config.postInsertUpdate.idColumn} = $2`;
  for (const entry of postUpdateValues) {
    if (!entry.value && !config.postInsertUpdate.nullable) {
      continue;
    }
    const result = await pgClient.query(updateSql, [entry.value, entry.id]);
    updated += result.rowCount ?? 0;
  }

  return { copied, updated };
}

async function resetTarget(pgClient: PoolClient): Promise<void> {
  for (const table of RESET_ORDER) {
    await pgClient.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
  }
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.TARGET_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Defina DATABASE_URL (ou TARGET_DATABASE_URL) apontando para o PostgreSQL.");
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrl;
  }

  const sqlitePath = resolveSqlitePath();
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`Arquivo SQLite nao encontrado: ${sqlitePath}`);
  }

  console.log(`[migrate] source sqlite: ${sqlitePath}`);
  console.log("[migrate] target postgres: DATABASE_URL");

  const { initDbOnce } = await import("../lib/db");
  await initDbOnce();

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    if (readFlag("RESET_TARGET")) {
      console.log("[migrate] RESET_TARGET ativo: limpando tabelas de destino...");
      await resetTarget(client);
    }

    for (const config of COPY_ORDER) {
      const result = await copyTableData({ sqlite, pgClient: client, config });
      console.log(
        `[migrate] ${config.table}: inseridos=${result.copied}${config.postInsertUpdate ? ` | atualizados=${result.updated}` : ""}`
      );
    }

    await client.query("COMMIT");
    console.log("PASS");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha inesperada";
  console.error(`[migrate] FAIL: ${message}`);
  process.exitCode = 1;
});
