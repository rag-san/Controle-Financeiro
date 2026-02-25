import { db } from "../lib/db";
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

type ResetMode = "soft" | "full";
type UserRow = { id: string };
type ResetOptions = {
  mode: ResetMode;
  purgeConfig: boolean;
};

function resolveResetOptions(argv: string[]): ResetOptions {
  return {
    mode: argv.includes("--full") ? "full" : "soft",
    purgeConfig: argv.includes("--purge-config")
  };
}

function selectTablesForReset(allTables: string[], options: ResetOptions): string[] {
  if (options.purgeConfig) {
    return allTables;
  }

  return allTables.filter((table) => !PRESERVED_CONFIG_TABLES.has(table));
}

async function resetPostgres(tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const quotedTables = tables.map(quoteIdentifier).join(", ");
  await db.exec(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
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
  const options = resolveResetOptions(process.argv.slice(2));
  const tables = selectTablesForReset(await listResettableTables(), options);
  await resetPostgres(tables);

  const defaultCategoriesRestore =
    !options.purgeConfig
      ? await ensureDefaultCategoriesForExistingUsers()
      : { usersScanned: 0, categoriesCreated: 0, rulesCreated: 0 };

  console.log(`[reset:data] dialect=${db.dialect}`);
  console.log(`[reset:data] mode=${options.mode}`);
  console.log(`[reset:data] purge_config=${options.purgeConfig}`);
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
