import { db } from "@/lib/db";
import { escapeLike } from "@/lib/server/sql";

type TransactionType = "income" | "expense" | "transfer";
type AccountType = "checking" | "credit" | "cash" | "investment";

export type AnalyticsSourceScope = {
  userId: string;
  from?: Date;
  to?: Date;
  accountId?: string;
  categoryId?: string;
  excluded?: boolean;
  normalizedQuery?: string;
  transactionTypes?: TransactionType[];
  accountTypes?: AccountType[];
  hideCardPaymentMirrorInflow?: boolean;
  includeBalanceAdjustments?: boolean;
};

function buildLegacyVisibilityClause(
  alias: string,
  excluded: boolean,
  includeBalanceAdjustments: boolean
): string {
  const scoped = alias.trim().length > 0 ? `${alias}.` : "";

  if (excluded) {
    return `${scoped}excluded = TRUE`;
  }

  if (!includeBalanceAdjustments) {
    return `${scoped}excluded = FALSE`;
  }

  return `(
    ${scoped}excluded = FALSE
    OR (
      ${scoped}excluded = TRUE
      AND ${scoped}raw_json IS NOT NULL
      AND ${scoped}raw_json LIKE '%"openingBalanceAdjustment":true%'
    )
  )`;
}

function buildLedgerVisibilityClause(
  alias: string,
  excluded: boolean,
  includeBalanceAdjustments: boolean
): string {
  const scoped = alias.trim().length > 0 ? `${alias}.` : "";

  if (excluded) {
    return `${scoped}excluded = TRUE`;
  }

  if (!includeBalanceAdjustments) {
    return `${scoped}excluded = FALSE`;
  }

  return `(${scoped}excluded = FALSE OR ${scoped}is_balance_adjustment = TRUE)`;
}

function buildLegacyScopeWhere(input: AnalyticsSourceScope): { sql: string; params: unknown[] } {
  const clauses = ["t.user_id = ?"];
  const params: unknown[] = [input.userId];

  if (input.from) {
    clauses.push("t.posted_at >= ?");
    params.push(input.from.toISOString());
  }
  if (input.to) {
    clauses.push("t.posted_at <= ?");
    params.push(input.to.toISOString());
  }
  if (input.accountId) {
    clauses.push("t.account_id = ?");
    params.push(input.accountId);
  }
  if (input.categoryId) {
    clauses.push("t.category_id = ?");
    params.push(input.categoryId);
  }
  if (input.normalizedQuery) {
    clauses.push("t.normalized_description LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(input.normalizedQuery)}%`);
  }

  const transactionTypes = [
    ...new Set(
      (input.transactionTypes ?? []).filter(
        (value): value is TransactionType =>
          value === "income" || value === "expense" || value === "transfer"
      )
    )
  ];
  if (transactionTypes.length > 0) {
    clauses.push(`t.type IN (${transactionTypes.map(() => "?::transaction_type").join(", ")})`);
    params.push(...transactionTypes);
  }

  const accountTypes = [
    ...new Set(
      (input.accountTypes ?? []).filter(
        (value): value is AccountType =>
          value === "checking" || value === "credit" || value === "cash" || value === "investment"
      )
    )
  ];
  if (accountTypes.length > 0) {
    clauses.push(`a.type IN (${accountTypes.map(() => "?").join(", ")})`);
    params.push(...accountTypes);
  }

  clauses.push(
    buildLegacyVisibilityClause(
      "t",
      input.excluded ?? false,
      input.includeBalanceAdjustments ?? false
    )
  );

  if (input.hideCardPaymentMirrorInflow) {
    clauses.push(
      `NOT (
        t.type = 'transfer'::transaction_type
        AND t.direction = 'in'::transaction_direction
        AND t.is_internal_transfer = TRUE
        AND t.raw_json IS NOT NULL
        AND t.raw_json LIKE '%"transferDetectedFromCardPayment":true%'
      )`
    );
  }

  return {
    sql: clauses.join(" AND "),
    params
  };
}

function buildLedgerScopeWhere(input: AnalyticsSourceScope): { sql: string; params: unknown[] } {
  const clauses = ["le.user_id = ?"];
  const params: unknown[] = [input.userId];

  if (input.from) {
    clauses.push("le.posted_at >= ?");
    params.push(input.from.toISOString());
  }
  if (input.to) {
    clauses.push("le.posted_at <= ?");
    params.push(input.to.toISOString());
  }
  if (input.accountId) {
    clauses.push("(le.account_id = ? OR le.credit_card_account_id = ?)");
    params.push(input.accountId, input.accountId);
  }
  if (input.categoryId) {
    clauses.push("le.category_id = ?");
    params.push(input.categoryId);
  }
  if (input.normalizedQuery) {
    clauses.push("le.description_normalized LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(input.normalizedQuery)}%`);
  }

  clauses.push(
    buildLedgerVisibilityClause(
      "le",
      input.excluded ?? false,
      input.includeBalanceAdjustments ?? false
    )
  );

  return {
    sql: clauses.join(" AND "),
    params
  };
}

export async function hasUnmirroredLegacyTransactions(input: AnalyticsSourceScope): Promise<boolean> {
  const where = buildLegacyScopeWhere(input);
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM transactions t
       JOIN accounts a
         ON a.id = t.account_id
        AND a.user_id = t.user_id
       LEFT JOIN ledger_entries le
         ON le.user_id = t.user_id
        AND le.external_ref = ('LEGACY_TX:' || t.id)
       WHERE ${where.sql}
         AND le.id IS NULL`
    )
    .get(...where.params)) as { count: number | string | null } | undefined;

  return Number(row?.count ?? 0) > 0;
}

export async function hasLedgerEntriesInScope(input: AnalyticsSourceScope): Promise<boolean> {
  const where = buildLedgerScopeWhere(input);
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM ledger_entries le
       WHERE ${where.sql}`
    )
    .get(...where.params)) as { count: number | string | null } | undefined;

  return Number(row?.count ?? 0) > 0;
}

export async function shouldUseLedgerForAnalytics(input: AnalyticsSourceScope): Promise<boolean> {
  const missingLegacy = await hasUnmirroredLegacyTransactions(input);
  if (missingLegacy) {
    return false;
  }

  return hasLedgerEntriesInScope(input);
}
