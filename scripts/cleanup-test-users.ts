import { db, initDbOnce } from "../lib/db";

type UserRow = {
  id: string;
  email: string;
  created_at?: string;
};

type CountRow = {
  count: number | string;
};

const TEST_EMAIL_EXACT = ["seed.reports@example.com"];
const TEST_EMAIL_LIKE = [
  "integration.%@example.com",
  "integration.second.%@example.com",
  "parse-%@example.com",
  "parse.%@example.com"
];

const COUNT_TABLES = [
  "users",
  "accounts",
  "categories",
  "category_rules",
  "transactions",
  "import_batches",
  "import_items",
  "import_events",
  "net_worth_entries",
  "recurring_items",
  "official_metric_snapshots"
] as const;

function toCount(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

async function countTable(table: string): Promise<number> {
  const rows = await db.query<CountRow>(`SELECT COUNT(*)::int AS count FROM "${table}"`);
  return toCount(rows.rows[0]?.count);
}

function buildUsersWhereClause(): { clause: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];

  for (const email of TEST_EMAIL_EXACT) {
    clauses.push("email = ?");
    params.push(email);
  }

  for (const pattern of TEST_EMAIL_LIKE) {
    clauses.push("email LIKE ?");
    params.push(pattern);
  }

  return {
    clause: clauses.length > 0 ? clauses.map((part) => `(${part})`).join(" OR ") : "1 = 0",
    params
  };
}

async function run(): Promise<void> {
  await initDbOnce();

  const beforeCounts = Object.fromEntries(
    await Promise.all(COUNT_TABLES.map(async (table) => [table, await countTable(table)]))
  );

  const where = buildUsersWhereClause();
  const usersToDelete = await db
    .prepare(`SELECT id, email, created_at FROM users WHERE ${where.clause} ORDER BY created_at DESC, email ASC`)
    .all<UserRow>(...where.params);

  if (usersToDelete.length === 0) {
    console.log("[cleanup:test-users] nenhum usuário de teste encontrado.");
    console.log(`[cleanup:test-users] users_before=${beforeCounts.users} users_after=${beforeCounts.users}`);
    console.log("PASS");
    return;
  }

  const deleteUsersTx = db.transaction(async () => {
    for (const user of usersToDelete) {
      await db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    }
  });
  await deleteUsersTx();

  if (db.dialect === "postgres") {
    await db.exec("VACUUM (ANALYZE)");
  }

  const remainingTestUsers = await db
    .prepare(`SELECT id, email FROM users WHERE ${where.clause} ORDER BY email ASC`)
    .all<UserRow>(...where.params);

  const afterCounts = Object.fromEntries(
    await Promise.all(COUNT_TABLES.map(async (table) => [table, await countTable(table)]))
  );

  console.log(`[cleanup:test-users] deleted=${usersToDelete.length}`);
  console.log(
    `[cleanup:test-users] deleted_emails=${usersToDelete.map((user) => user.email).join(", ")}`
  );
  console.log(`[cleanup:test-users] remaining_test_users=${remainingTestUsers.length}`);
  console.log(`[cleanup:test-users] counts_before=${JSON.stringify(beforeCounts)}`);
  console.log(`[cleanup:test-users] counts_after=${JSON.stringify(afterCounts)}`);

  if (remainingTestUsers.length > 0) {
    throw new Error("Ainda existem usuários de teste após a limpeza.");
  }

  console.log("PASS");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha inesperada.";
  console.error(`[cleanup:test-users] FAIL: ${message}`);
  process.exitCode = 1;
});
