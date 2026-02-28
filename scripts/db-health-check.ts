import { db, initDbOnce } from "../lib/db";

type NumericRow = {
  count: number | string;
};

type CheckResult = {
  key: string;
  value: number;
  severity: "error" | "warn";
  message: string;
};

function toNumber(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const result = await db.query<NumericRow>(sql, params);
  return toNumber(result.rows[0]?.count);
}

async function buildChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const orphanAccounts = await count(`
    SELECT COUNT(*)::int AS count
    FROM accounts a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE u.id IS NULL
  `);
  results.push({
    key: "orphan_accounts",
    value: orphanAccounts,
    severity: "error",
    message: "Contas sem usuário válido."
  });

  const orphanCategories = await count(`
    SELECT COUNT(*)::int AS count
    FROM categories c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE u.id IS NULL
  `);
  results.push({
    key: "orphan_categories",
    value: orphanCategories,
    severity: "error",
    message: "Categorias sem usuário válido."
  });

  const orphanRules = await count(`
    SELECT COUNT(*)::int AS count
    FROM category_rules r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE u.id IS NULL
  `);
  results.push({
    key: "orphan_category_rules",
    value: orphanRules,
    severity: "error",
    message: "Regras de categoria sem usuário válido."
  });

  const orphanTransactions = await count(`
    SELECT COUNT(*)::int AS count
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE u.id IS NULL OR a.id IS NULL
  `);
  results.push({
    key: "orphan_transactions",
    value: orphanTransactions,
    severity: "error",
    message: "Transações órfãs de usuário ou conta."
  });

  const transferFlagMismatch = await count(`
    SELECT COUNT(*)::int AS count
    FROM transactions
    WHERE (type = 'transfer'::transaction_type AND is_internal_transfer = FALSE)
       OR (type <> 'transfer'::transaction_type AND is_internal_transfer = TRUE)
  `);
  results.push({
    key: "transfer_flag_mismatch",
    value: transferFlagMismatch,
    severity: "error",
    message: "Inconsistência entre tipo transfer e flag is_internal_transfer."
  });

  const duplicateImportedHash = await count(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT user_id, imported_hash
      FROM transactions
      WHERE imported_hash IS NOT NULL AND BTRIM(imported_hash) <> ''
      GROUP BY user_id, imported_hash
      HAVING COUNT(*) > 1
    ) duplicated
  `);
  results.push({
    key: "duplicate_imported_hash",
    value: duplicateImportedHash,
    severity: "error",
    message: "Hashes importados duplicados por usuário."
  });

  const duplicateCategoryNameByUser = await count(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT user_id, LOWER(name) AS name_key
      FROM categories
      GROUP BY user_id, LOWER(name)
      HAVING COUNT(*) > 1
    ) duplicated
  `);
  results.push({
    key: "duplicate_category_names_per_user",
    value: duplicateCategoryNameByUser,
    severity: "warn",
    message: "Categorias com nome duplicado (case-insensitive) por usuário."
  });

  return results;
}

async function run(): Promise<void> {
  await initDbOnce();

  const tableCounts = {
    users: await count(`SELECT COUNT(*)::int AS count FROM users`),
    accounts: await count(`SELECT COUNT(*)::int AS count FROM accounts`),
    categories: await count(`SELECT COUNT(*)::int AS count FROM categories`),
    category_rules: await count(`SELECT COUNT(*)::int AS count FROM category_rules`),
    transactions: await count(`SELECT COUNT(*)::int AS count FROM transactions`)
  };

  const checks = await buildChecks();
  const errors = checks.filter((item) => item.severity === "error" && item.value > 0);
  const warnings = checks.filter((item) => item.severity === "warn" && item.value > 0);

  console.log(`[db:health] counts=${JSON.stringify(tableCounts)}`);
  for (const check of checks) {
    console.log(
      `[db:health] ${check.key}=${check.value} severity=${check.severity} message="${check.message}"`
    );
  }

  if (warnings.length > 0) {
    console.log(
      `[db:health] warnings=${warnings.map((item) => `${item.key}:${item.value}`).join(", ")}`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Falha de integridade: ${errors.map((item) => `${item.key}:${item.value}`).join(", ")}`
    );
  }

  console.log("PASS");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha inesperada.";
  console.error(`[db:health] FAIL: ${message}`);
  process.exitCode = 1;
});
