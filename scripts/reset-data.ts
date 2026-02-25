import { DB_FILE_PATH, db } from "../lib/db";
import { restoreDefaultCategoriesForUser } from "../lib/server/default-categories.service";

const EXCLUDED_TABLES = new Set(["_prisma_migrations"]);
const PRESERVED_CONFIG_TABLES = new Set(["users", "accounts", "categories", "category_rules"]);

type TableNameRow = {
  name?: string;
  table_name?: string;
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function sortTableNames(tables: string[]): string[] {
  return [...tables].sort((left, right) => left.localeCompare(right));
}

async function listResettableTables(): Promise<string[]> {
  if (db.dialect === "postgres") {
    const result = await db.query<TableNameRow>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );

    return sortTableNames(
      result.rows
        .map((row) => row.table_name ?? "")
        .filter((name) => Boolean(name) && !EXCLUDED_TABLES.has(name))
    );
  }

  const rows = (await db.prepare(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
  ).all()) as TableNameRow[];

  return sortTableNames(
    rows
      .map((row) => row.name ?? "")
      .filter((name) => Boolean(name) && !EXCLUDED_TABLES.has(name))
  );
}

type ResetMode = "soft" | "full";
type UserRow = { id: string };

function resolveResetMode(argv: string[]): ResetMode {
  if (argv.includes("--full")) {
    return "full";
  }

  return "soft";
}

function selectTablesForReset(allTables: string[], mode: ResetMode): string[] {
  if (mode === "full") {
    return allTables;
  }

  return allTables.filter((table) => !PRESERVED_CONFIG_TABLES.has(table));
}

async function resetPostgres(tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const quotedTables = tables.map(quoteIdentifier).join(", ");
  await db.exec(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
}

async function resetSqlite(tables: string[]): Promise<void> {
  await db.exec("PRAGMA foreign_keys = OFF;");
  try {
    for (const table of tables) {
      await db.exec(`DELETE FROM ${quoteIdentifier(table)};`);
    }

    const hasSqliteSequence = (await db.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name = 'sqlite_sequence'
       LIMIT 1`
    ).get()) as TableNameRow | undefined;

    if (hasSqliteSequence?.name === "sqlite_sequence") {
      await db.exec("DELETE FROM sqlite_sequence;");
    }

    await db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    await db.exec("PRAGMA foreign_keys = ON;");
  }
}

async function ensureDefaultCategoriesForExistingUsers(): Promise<{
  usersScanned: number;
  categoriesCreated: number;
  rulesCreated: number;
}> {
  const users = (await db.prepare(`SELECT id FROM users`).all()) as UserRow[];
  let categoriesCreated = 0;
  let rulesCreated = 0;

  for (const user of users) {
    const restored = await restoreDefaultCategoriesForUser(user.id);
    categoriesCreated += restored.createdCategories;
    rulesCreated += restored.createdRules;
  }

  return {
    usersScanned: users.length,
    categoriesCreated,
    rulesCreated
  };
}

async function run(): Promise<void> {
  const mode = resolveResetMode(process.argv.slice(2));
  const tables = selectTablesForReset(await listResettableTables(), mode);

  if (db.dialect === "postgres") {
    await resetPostgres(tables);
  } else {
    await resetSqlite(tables);
  }

  const defaultCategoriesRestore =
    mode === "soft"
      ? await ensureDefaultCategoriesForExistingUsers()
      : { usersScanned: 0, categoriesCreated: 0, rulesCreated: 0 };

  console.log(`[reset:data] dialect=${db.dialect}`);
  console.log(`[reset:data] mode=${mode}`);
  if (db.dialect === "sqlite" && DB_FILE_PATH) {
    console.log(`[reset:data] sqlite_file=${DB_FILE_PATH}`);
  }
  console.log(`[reset:data] tables_reset=${tables.length}`);
  console.log(`[reset:data] tables=${tables.join(", ") || "(none)"}`);
  console.log(
    `[reset:data] defaults_restored users=${defaultCategoriesRestore.usersScanned} categories=${defaultCategoriesRestore.categoriesCreated} rules=${defaultCategoriesRestore.rulesCreated}`
  );
  console.log("PASS");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha inesperada ao resetar dados.";
  console.error(`[reset:data] FAIL: ${message}`);
  process.exitCode = 1;
});
