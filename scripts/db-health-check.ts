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

  const transactionSignMismatch = await count(`
    SELECT COUNT(*)::int AS count
    FROM transactions
    WHERE (type = 'income'::transaction_type AND amount_cents < 0)
       OR (type = 'expense'::transaction_type AND amount_cents > 0)
       OR (direction = 'in'::transaction_direction AND amount_cents < 0)
       OR (direction = 'out'::transaction_direction AND amount_cents > 0)
  `);
  results.push({
    key: "transaction_type_sign_mismatch",
    value: transactionSignMismatch,
    severity: "error",
    message: "Transações com tipo/direção incompatíveis com o sinal do valor."
  });

  const transferMirrorMismatch = await count(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT user_id, transfer_group_id
      FROM transactions
      WHERE type = 'transfer'::transaction_type
        AND is_internal_transfer = TRUE
        AND transfer_group_id IS NOT NULL
      GROUP BY user_id, transfer_group_id
      HAVING COUNT(*) <> 2 OR COALESCE(SUM(amount_cents), 0) <> 0
    ) invalid_transfer_groups
  `);
  results.push({
    key: "transfer_mirror_mismatch",
    value: transferMirrorMismatch,
    severity: "error",
    message: "Transferências internas sem par espelhado ou com soma diferente de zero."
  });

  const latestConfirmedBalanceDivergence = await count(`
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (user_id, account_id)
        user_id,
        account_id,
        balance_cents
      FROM account_balance_snapshots
      ORDER BY user_id, account_id, balance_date DESC, created_at DESC
    ),
    calculated AS (
      SELECT
        user_id,
        account_id,
        COALESCE(SUM(amount_cents), 0)::bigint AS calculated_cents
      FROM transactions
      WHERE excluded = FALSE
      GROUP BY user_id, account_id
    )
    SELECT COUNT(*)::int AS count
    FROM latest_snapshots s
    LEFT JOIN calculated c
      ON c.user_id = s.user_id
     AND c.account_id = s.account_id
    WHERE ABS(COALESCE(c.calculated_cents, 0) - s.balance_cents) > 1
  `);
  results.push({
    key: "confirmed_balance_divergence",
    value: latestConfirmedBalanceDivergence,
    severity: "warn",
    message: "Saldo calculado diverge do último saldo confirmado por extrato."
  });

  const cardPaymentAsExpense = await count(`
    SELECT COUNT(*)::int AS count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.excluded = FALSE
      AND t.type = 'expense'::transaction_type
      AND t.is_internal_transfer = FALSE
      AND a.type IN ('checking', 'cash')
      AND t.normalized_description LIKE '%FATURA%'
      AND t.normalized_description LIKE '%CART%'
  `);
  results.push({
    key: "card_payment_as_cash_expense",
    value: cardPaymentAsExpense,
    severity: "warn",
    message: "Pagamentos de fatura no caixa salvos como despesa comum em vez de transferência."
  });

  const unmatchedLedgerCardPayments = await count(`
    SELECT COUNT(*)::int AS count
    FROM ledger_entries
    WHERE type = 'cc_payment'
      AND reconciliation_status <> 'matched'
      AND excluded = FALSE
  `);
  results.push({
    key: "unmatched_ledger_card_payments",
    value: unmatchedLedgerCardPayments,
    severity: "warn",
    message: "Pagamentos de fatura no ledger ainda sem conciliação."
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
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
