import { db } from "@/lib/db";
import { escapeLike } from "@/lib/server/sql";

type TransactionType = "income" | "expense" | "transfer";
type AccountType = "checking" | "credit" | "cash" | "investment";
type LedgerComparableType = "income" | "expense" | "transfer" | "cc_purchase" | "cc_payment" | "fee" | "refund";

export type AnalyticsSourceResolution = {
  source: "legacy" | "ledger";
  reason:
    | "unmirrored_legacy_transactions"
    | "ledger_entries_available"
    | "no_ledger_entries_in_scope";
  hasUnmirroredLegacyTransactions: boolean;
  hasLedgerEntriesInScope: boolean;
};

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

function normalizeTransactionTypes(value?: TransactionType[]): TransactionType[] {
  return [
    ...new Set(
      (value ?? []).filter(
        (item): item is TransactionType =>
          item === "income" || item === "expense" || item === "transfer"
      )
    )
  ];
}

function normalizeAccountTypes(value?: AccountType[]): AccountType[] {
  return [
    ...new Set(
      (value ?? []).filter(
        (item): item is AccountType =>
          item === "checking" || item === "credit" || item === "cash" || item === "investment"
      )
    )
  ];
}

function mapTransactionTypesToLedgerTypes(types: TransactionType[]): LedgerComparableType[] {
  const ledgerTypes = new Set<LedgerComparableType>();

  for (const type of types) {
    if (type === "income") {
      ledgerTypes.add("income");
      continue;
    }

    if (type === "expense") {
      ledgerTypes.add("expense");
      ledgerTypes.add("cc_purchase");
      ledgerTypes.add("fee");
      ledgerTypes.add("refund");
      continue;
    }

    if (type === "transfer") {
      ledgerTypes.add("transfer");
      ledgerTypes.add("cc_payment");
    }
  }

  return [...ledgerTypes];
}

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

  const transactionTypes = normalizeTransactionTypes(input.transactionTypes);
  if (transactionTypes.length > 0) {
    clauses.push(`t.type IN (${transactionTypes.map(() => "?::transaction_type").join(", ")})`);
    params.push(...transactionTypes);
  }

  const accountTypes = normalizeAccountTypes(input.accountTypes);
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

function buildLedgerScopeWhere(input: AnalyticsSourceScope): {
  sql: string;
  params: unknown[];
  requiresAccountJoin: boolean;
} {
  const clauses = ["le.user_id = ?"];
  const params: unknown[] = [input.userId];
  let requiresAccountJoin = false;

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

  const ledgerTypes = mapTransactionTypesToLedgerTypes(normalizeTransactionTypes(input.transactionTypes));
  if (ledgerTypes.length > 0) {
    clauses.push(`le.type IN (${ledgerTypes.map(() => "?").join(", ")})`);
    params.push(...ledgerTypes);
  }

  const accountTypes = normalizeAccountTypes(input.accountTypes);
  if (accountTypes.length > 0) {
    const nonCreditAccountTypes = accountTypes.filter((type) => type !== "credit");
    const accountTypeClauses: string[] = [];

    if (nonCreditAccountTypes.length > 0) {
      requiresAccountJoin = true;
      accountTypeClauses.push(`a.type IN (${nonCreditAccountTypes.map(() => "?").join(", ")})`);
      params.push(...nonCreditAccountTypes);
    }

    if (accountTypes.includes("credit")) {
      accountTypeClauses.push("le.credit_card_account_id IS NOT NULL");
    }

    clauses.push(`(${accountTypeClauses.join(" OR ")})`);
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
    params,
    requiresAccountJoin
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
       ${where.requiresAccountJoin ? `LEFT JOIN accounts a
         ON a.id = le.account_id
        AND a.user_id = le.user_id` : ""}
       WHERE ${where.sql}`
    )
    .get(...where.params)) as { count: number | string | null } | undefined;

  return Number(row?.count ?? 0) > 0;
}

export async function resolveAnalyticsSource(
  input: AnalyticsSourceScope
): Promise<AnalyticsSourceResolution> {
  const missingLegacy = await hasUnmirroredLegacyTransactions(input);
  if (missingLegacy) {
    return {
      source: "legacy",
      reason: "unmirrored_legacy_transactions",
      hasUnmirroredLegacyTransactions: true,
      hasLedgerEntriesInScope: false
    };
  }

  const ledgerAvailable = await hasLedgerEntriesInScope(input);
  if (ledgerAvailable) {
    return {
      source: "ledger",
      reason: "ledger_entries_available",
      hasUnmirroredLegacyTransactions: false,
      hasLedgerEntriesInScope: true
    };
  }

  return {
    source: "legacy",
    reason: "no_ledger_entries_in_scope",
    hasUnmirroredLegacyTransactions: false,
    hasLedgerEntriesInScope: false
  };
}

export async function shouldUseLedgerForAnalytics(input: AnalyticsSourceScope): Promise<boolean> {
  const resolution = await resolveAnalyticsSource(input);
  return resolution.source === "ledger";
}
