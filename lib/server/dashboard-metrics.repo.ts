import { addDays, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { escapeLike } from "@/lib/server/sql";

export type DashboardGranularity = "day" | "week" | "month";

export type DashboardMetricsFilters = {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense" | "transfer";
  excluded?: boolean;
  normalizedQuery?: string;
};

export type DashboardDateRange = {
  fromDate: Date;
  toDate: Date;
  previousFromDate: Date;
  previousToDate: Date;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

export type DashboardSummary = {
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  excludedTotal: number;
  previousPeriodComparison: {
    delta: number;
    percent: number;
    previousNet: number;
    previousIncome: number;
    previousExpense: number;
    previousExcludedTotal: number;
  };
};

export type DashboardCategory = {
  categoryId: string | null;
  name: string;
  color: string;
  total: number;
  percent: number;
  previousTotal: number;
  variationPercent: number;
};

export type DashboardTrendPoint = {
  bucket: string;
  income: number;
  expense: number;
  net: number;
};

export type DashboardPatrimonyPoint = {
  bucket: string;
  value: number;
};

type TotalsRow = {
  period: "current" | "previous";
  income_cents: number | string | null;
  expense_cents: number | string | null;
  excluded_cents: number | string | null;
};

type CategoriesRow = {
  category_key: string;
  name: string | null;
  color: string | null;
  total_cents: number | string | null;
  previous_total_cents: number | string | null;
  percent: number | string | null;
};

type TrendRow = {
  bucket_date: string;
  income_cents: number | string | null;
  expense_cents: number | string | null;
};

type PatrimonyDeltaRow = {
  bucket_date: string;
  delta_cents: number | string | null;
};

type ResolvedDashboardFilters = {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense" | "transfer";
  excluded: boolean;
  normalizedQuery?: string;
};

function toAmount(cents: number | string | null | undefined): number {
  const numeric = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(numeric)) return 0;
  return Number(((numeric ?? 0) / 100).toFixed(2));
}

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function utcStartOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function utcEndOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function isSameUtcMonth(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}

function safeVariationPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return toPercent(((current - previous) / Math.abs(previous)) * 100);
}

function floorBucket(date: Date, granularity: DashboardGranularity): Date {
  const base = utcStartOfDay(date);
  if (granularity === "day") return base;

  if (granularity === "week") {
    const jsWeekday = base.getUTCDay();
    const mondayOffset = jsWeekday === 0 ? -6 : 1 - jsWeekday;
    return utcStartOfDay(addDays(base, mondayOffset));
  }

  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addBucket(date: Date, granularity: DashboardGranularity): Date {
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function normalizeBucketKey(value: string): string {
  return value.slice(0, 10);
}

function resolveDashboardFilters(filters?: DashboardMetricsFilters): ResolvedDashboardFilters {
  return {
    accountId: filters?.accountId,
    categoryId: filters?.categoryId,
    type: filters?.type,
    excluded: filters?.excluded ?? false,
    normalizedQuery: filters?.normalizedQuery
  };
}

function buildDashboardFilterSql(
  alias: string,
  filters: ResolvedDashboardFilters
): { sql: string; params: unknown[] } {
  const scoped = alias.trim().length > 0 ? `${alias}.` : "";
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.accountId) {
    clauses.push(`${scoped}account_id = ?`);
    params.push(filters.accountId);
  }
  if (filters.categoryId) {
    clauses.push(`${scoped}category_id = ?`);
    params.push(filters.categoryId);
  }
  if (filters.type) {
    clauses.push(`${scoped}type = ?::transaction_type`);
    params.push(filters.type);
  }
  if (filters.normalizedQuery) {
    clauses.push(`${scoped}normalized_description LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.normalizedQuery)}%`);
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "",
    params
  };
}

function buildBucketSeries(fromDate: Date, toDate: Date, granularity: DashboardGranularity): string[] {
  const buckets: string[] = [];
  const end = floorBucket(toDate, granularity);
  for (
    let cursor = floorBucket(fromDate, granularity);
    cursor.getTime() <= end.getTime();
    cursor = addBucket(cursor, granularity)
  ) {
    buckets.push(formatUtcDate(cursor));
  }
  return buckets;
}

export function resolveDashboardDateRange(input: { from?: Date; to?: Date; now?: Date }): DashboardDateRange {
  const now = input.now ?? new Date();
  const defaultFrom = utcStartOfMonth(now);
  const defaultTo = utcEndOfMonth(now);

  const fromDate = utcStartOfDay(input.from ?? defaultFrom);
  const toDate = utcEndOfDay(input.to ?? defaultTo);

  if (fromDate.getTime() > toDate.getTime()) {
    throw new Error("INVALID_DATE_RANGE");
  }

  let previousFromDate: Date;
  let previousToDate: Date;

  const isMonthAnchoredRange = fromDate.getUTCDate() === 1 && isSameUtcMonth(fromDate, toDate);
  if (isMonthAnchoredRange) {
    const previousMonthReference = subMonths(fromDate, 1);
    previousFromDate = utcStartOfMonth(previousMonthReference);

    const isFullMonthRange = toDate.getUTCDate() === utcEndOfMonth(toDate).getUTCDate();
    if (isFullMonthRange) {
      previousToDate = utcEndOfMonth(previousMonthReference);
    } else {
      const previousMonthLastDay = utcEndOfMonth(previousMonthReference).getUTCDate();
      const alignedDay = Math.min(toDate.getUTCDate(), previousMonthLastDay);
      previousToDate = new Date(
        Date.UTC(
          previousMonthReference.getUTCFullYear(),
          previousMonthReference.getUTCMonth(),
          alignedDay,
          23,
          59,
          59,
          999
        )
      );
    }
  } else {
    const totalDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    previousFromDate = utcStartOfDay(addDays(fromDate, -totalDays));
    previousToDate = utcEndOfDay(addDays(toDate, -totalDays));
  }

  return {
    fromDate,
    toDate,
    previousFromDate,
    previousToDate,
    from: formatUtcDate(fromDate),
    to: formatUtcDate(toDate),
    previousFrom: formatUtcDate(previousFromDate),
    previousTo: formatUtcDate(previousToDate)
  };
}

async function aggregateIncomeExpenseTotals(input: {
  userId: string;
  currentFrom: Date;
  currentTo: Date;
  previousFrom: Date;
  previousTo: Date;
  filters?: DashboardMetricsFilters;
}): Promise<{ current: { income: number; expense: number; excluded: number }; previous: { income: number; expense: number; excluded: number } }> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const filterClause = buildDashboardFilterSql("", resolvedFilters);
  const rows = (await db
    .prepare(
      `SELECT
         period,
         COALESCE(SUM(CASE WHEN type = 'income'::transaction_type AND excluded = ? THEN ABS(amount_cents) ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN type = 'expense'::transaction_type AND excluded = ? THEN ABS(amount_cents) ELSE 0 END), 0) AS expense_cents,
         COALESCE(SUM(CASE WHEN type IN ('income'::transaction_type, 'expense'::transaction_type) AND excluded = TRUE THEN ABS(amount_cents) ELSE 0 END), 0) AS excluded_cents
       FROM (
         SELECT
           CASE
             WHEN posted_at >= ? AND posted_at <= ? THEN 'current'
             WHEN posted_at >= ? AND posted_at <= ? THEN 'previous'
             ELSE NULL
           END AS period,
           type,
           amount_cents,
           excluded
         FROM transactions
         WHERE user_id = ?
           AND posted_at >= ?
           AND posted_at <= ?
           AND type IN ('income'::transaction_type, 'expense'::transaction_type)
           ${filterClause.sql}
       ) period_rows
       WHERE period IS NOT NULL
       GROUP BY period`
    )
    .all(
      resolvedFilters.excluded,
      resolvedFilters.excluded,
      input.currentFrom.toISOString(),
      input.currentTo.toISOString(),
      input.previousFrom.toISOString(),
      input.previousTo.toISOString(),
      input.userId,
      input.previousFrom.toISOString(),
      input.currentTo.toISOString(),
      ...filterClause.params
    )) as TotalsRow[];

  const current = { income: 0, expense: 0, excluded: 0 };
  const previous = { income: 0, expense: 0, excluded: 0 };

  for (const row of rows) {
    const target = row.period === "current" ? current : previous;
    target.income = toAmount(row.income_cents);
    target.expense = toAmount(row.expense_cents);
    target.excluded = toAmount(row.excluded_cents);
  }

  return { current, previous };
}

async function aggregateTrendsRaw(input: {
  userId: string;
  fromDate: Date;
  toDate: Date;
  granularity: DashboardGranularity;
  filters?: DashboardMetricsFilters;
}): Promise<Map<string, { income: number; expense: number }>> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const filterClause = buildDashboardFilterSql("", resolvedFilters);
  const rows = (await db
    .prepare(
      `SELECT
         DATE_TRUNC(?, posted_at::timestamptz AT TIME ZONE 'UTC')::date::text AS bucket_date,
         COALESCE(SUM(CASE WHEN type = 'income'::transaction_type THEN ABS(amount_cents) ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN type = 'expense'::transaction_type THEN ABS(amount_cents) ELSE 0 END), 0) AS expense_cents
       FROM transactions
       WHERE user_id = ?
         AND posted_at >= ?
         AND posted_at <= ?
         AND type IN ('income'::transaction_type, 'expense'::transaction_type)
         AND excluded = ?
         ${filterClause.sql}
       GROUP BY bucket_date
       ORDER BY bucket_date ASC`
    )
    .all(
      input.granularity,
      input.userId,
      input.fromDate.toISOString(),
      input.toDate.toISOString(),
      resolvedFilters.excluded,
      ...filterClause.params
    )) as TrendRow[];

  return new Map(
    rows.map((row) => [
      normalizeBucketKey(row.bucket_date),
      {
        income: toAmount(row.income_cents),
        expense: toAmount(row.expense_cents)
      }
    ])
  );
}

async function getPatrimonyBaselineCents(input: {
  userId: string;
  before: Date;
  filters?: DashboardMetricsFilters;
}): Promise<number> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const filterClause = buildDashboardFilterSql("", resolvedFilters);
  const row = (await db
    .prepare(
      `SELECT
         COALESCE(
           SUM(
             CASE
               WHEN type = 'income'::transaction_type THEN ABS(amount_cents)
               WHEN type = 'expense'::transaction_type THEN -ABS(amount_cents)
               ELSE amount_cents
             END
           ),
           0
         ) AS baseline_cents
       FROM transactions
       WHERE user_id = ?
         AND posted_at < ?
         AND excluded = ?
         ${filterClause.sql}`
    )
    .get(input.userId, input.before.toISOString(), resolvedFilters.excluded, ...filterClause.params)) as
    | { baseline_cents: number | string | null }
    | undefined;

  return Number(row?.baseline_cents ?? 0);
}

async function getPatrimonyDeltasByBucket(input: {
  userId: string;
  fromDate: Date;
  toDate: Date;
  granularity: DashboardGranularity;
  filters?: DashboardMetricsFilters;
}): Promise<Map<string, number>> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const filterClause = buildDashboardFilterSql("", resolvedFilters);
  const rows = (await db
    .prepare(
      `SELECT
         DATE_TRUNC(?, posted_at::timestamptz AT TIME ZONE 'UTC')::date::text AS bucket_date,
         COALESCE(
           SUM(
             CASE
               WHEN type = 'income'::transaction_type THEN ABS(amount_cents)
               WHEN type = 'expense'::transaction_type THEN -ABS(amount_cents)
               ELSE amount_cents
             END
           ),
           0
         ) AS delta_cents
       FROM transactions
       WHERE user_id = ?
         AND posted_at >= ?
         AND posted_at <= ?
         AND excluded = ?
         ${filterClause.sql}
       GROUP BY bucket_date
       ORDER BY bucket_date ASC`
    )
    .all(
      input.granularity,
      input.userId,
      input.fromDate.toISOString(),
      input.toDate.toISOString(),
      resolvedFilters.excluded,
      ...filterClause.params
    )) as PatrimonyDeltaRow[];

  return new Map(rows.map((row) => [normalizeBucketKey(row.bucket_date), Number(row.delta_cents ?? 0)]));
}

function buildLedgerFilterSql(
  alias: string,
  filters: ResolvedDashboardFilters
): { sql: string; params: unknown[] } {
  const scoped = alias.trim().length > 0 ? `${alias}.` : "";
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.accountId) {
    clauses.push(`(${scoped}account_id = ? OR ${scoped}credit_card_account_id = ?)`);
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.categoryId) {
    clauses.push(`${scoped}category_id = ?`);
    params.push(filters.categoryId);
  }
  if (filters.type === "income") {
    clauses.push(`${scoped}type = 'income'`);
  } else if (filters.type === "expense") {
    clauses.push(`${scoped}type IN ('expense', 'cc_purchase')`);
  } else if (filters.type === "transfer") {
    clauses.push(`${scoped}type = 'transfer'`);
  }
  if (filters.normalizedQuery) {
    clauses.push(`${scoped}description_normalized LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.normalizedQuery)}%`);
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "",
    params
  };
}

async function hasLedgerEntries(input: { userId: string; fromDate: Date; toDate: Date }): Promise<boolean> {
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM ledger_entries
       WHERE user_id = ?
         AND posted_at >= ?
         AND posted_at <= ?`
    )
    .get(input.userId, input.fromDate.toISOString(), input.toDate.toISOString())) as
    | { count: number | string | null }
    | undefined;

  return Number(row?.count ?? 0) > 0;
}

async function aggregateIncomeExpenseTotalsFromLedger(input: {
  userId: string;
  currentFrom: Date;
  currentTo: Date;
  previousFrom: Date;
  previousTo: Date;
  filters?: DashboardMetricsFilters;
}): Promise<{ current: { income: number; expense: number; excluded: number }; previous: { income: number; expense: number; excluded: number } }> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const filterClause = buildLedgerFilterSql("", resolvedFilters);

  const rows = (await db
    .prepare(
      `SELECT
         period,
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN type IN ('expense', 'cc_purchase') THEN amount_cents ELSE 0 END), 0) AS expense_cents
       FROM (
         SELECT
           CASE
             WHEN posted_at >= ? AND posted_at <= ? THEN 'current'
             WHEN posted_at >= ? AND posted_at <= ? THEN 'previous'
             ELSE NULL
           END AS period,
           type,
           amount_cents
         FROM ledger_entries
         WHERE user_id = ?
           AND posted_at >= ?
           AND posted_at <= ?
           ${filterClause.sql}
       ) period_rows
       WHERE period IS NOT NULL
       GROUP BY period`
    )
    .all(
      input.currentFrom.toISOString(),
      input.currentTo.toISOString(),
      input.previousFrom.toISOString(),
      input.previousTo.toISOString(),
      input.userId,
      input.previousFrom.toISOString(),
      input.currentTo.toISOString(),
      ...filterClause.params
    )) as Array<{
    period: "current" | "previous";
    income_cents: number | string | null;
    expense_cents: number | string | null;
  }>;

  const current = { income: 0, expense: 0, excluded: 0 };
  const previous = { income: 0, expense: 0, excluded: 0 };

  for (const row of rows) {
    const target = row.period === "current" ? current : previous;
    target.income = toAmount(row.income_cents);
    target.expense = toAmount(row.expense_cents);
  }

  return { current, previous };
}

async function aggregateTrendsRawFromLedger(input: {
  userId: string;
  fromDate: Date;
  toDate: Date;
  granularity: DashboardGranularity;
  filters?: DashboardMetricsFilters;
}): Promise<Map<string, { income: number; expense: number }>> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const filterClause = buildLedgerFilterSql("", resolvedFilters);

  const rows = (await db
    .prepare(
      `SELECT
         DATE_TRUNC(?, posted_at::timestamptz AT TIME ZONE 'UTC')::date::text AS bucket_date,
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN type IN ('expense', 'cc_purchase') THEN amount_cents ELSE 0 END), 0) AS expense_cents
       FROM ledger_entries
       WHERE user_id = ?
         AND posted_at >= ?
         AND posted_at <= ?
         ${filterClause.sql}
       GROUP BY bucket_date
       ORDER BY bucket_date ASC`
    )
    .all(
      input.granularity,
      input.userId,
      input.fromDate.toISOString(),
      input.toDate.toISOString(),
      ...filterClause.params
    )) as TrendRow[];

  return new Map(
    rows.map((row) => [
      normalizeBucketKey(row.bucket_date),
      {
        income: toAmount(row.income_cents),
        expense: toAmount(row.expense_cents)
      }
    ])
  );
}

async function getTopCategoriesFromLedger(input: {
  userId: string;
  range: DashboardDateRange;
  limit: number;
  filters?: DashboardMetricsFilters;
}): Promise<DashboardCategory[]> {
  const resolvedFilters = resolveDashboardFilters(input.filters);
  const currentFilterClause = buildLedgerFilterSql("le", resolvedFilters);
  const previousFilterClause = buildLedgerFilterSql("le2", resolvedFilters);

  const rows = (await db
    .prepare(
      `WITH current_categories AS (
         SELECT
           COALESCE(le.category_id, 'uncategorized') AS category_key,
           COALESCE(c.name, 'Sem categoria') AS name,
           COALESCE(c.color, '#94a3b8') AS color,
           SUM(le.amount_cents) AS total_cents
         FROM ledger_entries le
         LEFT JOIN categories c
           ON c.id = le.category_id
          AND c.user_id = le.user_id
         WHERE le.user_id = ?
           AND le.posted_at >= ?
           AND le.posted_at <= ?
           AND le.type IN ('expense', 'cc_purchase')
           ${currentFilterClause.sql}
         GROUP BY COALESCE(le.category_id, 'uncategorized'), COALESCE(c.name, 'Sem categoria'), COALESCE(c.color, '#94a3b8')
       ),
       total_expenses AS (
         SELECT COALESCE(SUM(total_cents), 0) AS all_expense_cents
         FROM current_categories
       ),
       previous_categories AS (
         SELECT
           COALESCE(le2.category_id, 'uncategorized') AS category_key,
           SUM(le2.amount_cents) AS total_cents
         FROM ledger_entries le2
         WHERE le2.user_id = ?
           AND le2.posted_at >= ?
           AND le2.posted_at <= ?
           AND le2.type IN ('expense', 'cc_purchase')
           ${previousFilterClause.sql}
         GROUP BY COALESCE(le2.category_id, 'uncategorized')
       )
       SELECT
         c.category_key,
         c.name,
         c.color,
         c.total_cents,
         COALESCE(p.total_cents, 0) AS previous_total_cents,
         CASE
           WHEN t.all_expense_cents <= 0 THEN 0
           ELSE (c.total_cents::numeric / t.all_expense_cents::numeric) * 100
         END AS percent
       FROM current_categories c
       CROSS JOIN total_expenses t
       LEFT JOIN previous_categories p
         ON p.category_key = c.category_key
       ORDER BY c.total_cents DESC
       LIMIT ?`
    )
    .all(
      input.userId,
      input.range.fromDate.toISOString(),
      input.range.toDate.toISOString(),
      ...currentFilterClause.params,
      input.userId,
      input.range.previousFromDate.toISOString(),
      input.range.previousToDate.toISOString(),
      ...previousFilterClause.params,
      input.limit
    )) as CategoriesRow[];

  return rows.map((row) => {
    const total = toAmount(row.total_cents);
    const previousTotal = toAmount(row.previous_total_cents);
    const categoryId = row.category_key === "uncategorized" ? null : row.category_key;

    return {
      categoryId,
      name: row.name ?? "Sem categoria",
      color: row.color ?? "#94a3b8",
      total,
      percent: toPercent(Number(row.percent ?? 0)),
      previousTotal,
      variationPercent: safeVariationPercent(total, previousTotal)
    };
  });
}

export const dashboardMetricsRepo = {
  async getSummary(input: {
    userId: string;
    range: DashboardDateRange;
    filters?: DashboardMetricsFilters;
  }): Promise<DashboardSummary> {
    const useLedger =
      (await hasLedgerEntries({
        userId: input.userId,
        fromDate: input.range.fromDate,
        toDate: input.range.toDate
      })) ||
      (await hasLedgerEntries({
        userId: input.userId,
        fromDate: input.range.previousFromDate,
        toDate: input.range.previousToDate
      }));

    const totals = useLedger
      ? await aggregateIncomeExpenseTotalsFromLedger({
          userId: input.userId,
          currentFrom: input.range.fromDate,
          currentTo: input.range.toDate,
          previousFrom: input.range.previousFromDate,
          previousTo: input.range.previousToDate,
          filters: input.filters
        })
      : await aggregateIncomeExpenseTotals({
          userId: input.userId,
          currentFrom: input.range.fromDate,
          currentTo: input.range.toDate,
          previousFrom: input.range.previousFromDate,
          previousTo: input.range.previousToDate,
          filters: input.filters
        });

    const currentNet = Number((totals.current.income - totals.current.expense).toFixed(2));
    const previousNet = Number((totals.previous.income - totals.previous.expense).toFixed(2));
    const delta = Number((currentNet - previousNet).toFixed(2));

    return {
      from: input.range.from,
      to: input.range.to,
      totalIncome: totals.current.income,
      totalExpense: totals.current.expense,
      net: currentNet,
      excludedTotal: totals.current.excluded,
      previousPeriodComparison: {
        delta,
        percent: safeVariationPercent(currentNet, previousNet),
        previousNet,
        previousIncome: totals.previous.income,
        previousExpense: totals.previous.expense,
        previousExcludedTotal: totals.previous.excluded
      }
    };
  },

  async getTopCategories(input: {
    userId: string;
    range: DashboardDateRange;
    limit?: number;
    filters?: DashboardMetricsFilters;
  }): Promise<{ from: string; to: string; topCategories: DashboardCategory[] }> {
    const limit = input.limit ?? 8;
    const useLedger =
      (await hasLedgerEntries({
        userId: input.userId,
        fromDate: input.range.fromDate,
        toDate: input.range.toDate
      })) ||
      (await hasLedgerEntries({
        userId: input.userId,
        fromDate: input.range.previousFromDate,
        toDate: input.range.previousToDate
      }));

    if (useLedger) {
      const topCategories = await getTopCategoriesFromLedger({
        userId: input.userId,
        range: input.range,
        limit,
        filters: input.filters
      });

      return {
        from: input.range.from,
        to: input.range.to,
        topCategories
      };
    }

    const resolvedFilters = resolveDashboardFilters(input.filters);
    const currentFilterClause = buildDashboardFilterSql("t", resolvedFilters);
    const previousFilterClause = buildDashboardFilterSql("t2", resolvedFilters);
    const rows = (await db
      .prepare(
        `WITH current_categories AS (
           SELECT
             COALESCE(t.category_id, 'uncategorized') AS category_key,
             COALESCE(c.name, 'Sem categoria') AS name,
             COALESCE(c.color, '#94a3b8') AS color,
             SUM(ABS(t.amount_cents)) AS total_cents
           FROM transactions t
           LEFT JOIN categories c
             ON c.id = t.category_id
            AND c.user_id = t.user_id
           WHERE t.user_id = ?
             AND t.posted_at >= ?
             AND t.posted_at <= ?
             AND t.type = 'expense'::transaction_type
             AND t.excluded = ?
             ${currentFilterClause.sql}
           GROUP BY COALESCE(t.category_id, 'uncategorized'), COALESCE(c.name, 'Sem categoria'), COALESCE(c.color, '#94a3b8')
         ),
         total_expenses AS (
           SELECT COALESCE(SUM(total_cents), 0) AS all_expense_cents
           FROM current_categories
         ),
         previous_categories AS (
           SELECT
             COALESCE(t2.category_id, 'uncategorized') AS category_key,
             SUM(ABS(t2.amount_cents)) AS total_cents
           FROM transactions t2
           WHERE t2.user_id = ?
             AND t2.posted_at >= ?
             AND t2.posted_at <= ?
             AND t2.type = 'expense'::transaction_type
             AND t2.excluded = ?
             ${previousFilterClause.sql}
           GROUP BY COALESCE(t2.category_id, 'uncategorized')
         )
         SELECT
           c.category_key,
           c.name,
           c.color,
           c.total_cents,
           COALESCE(p.total_cents, 0) AS previous_total_cents,
           CASE
             WHEN t.all_expense_cents <= 0 THEN 0
             ELSE (c.total_cents::numeric / t.all_expense_cents::numeric) * 100
           END AS percent
         FROM current_categories c
         CROSS JOIN total_expenses t
         LEFT JOIN previous_categories p
           ON p.category_key = c.category_key
         ORDER BY c.total_cents DESC
         LIMIT ?`
      )
      .all(
        input.userId,
        input.range.fromDate.toISOString(),
        input.range.toDate.toISOString(),
        resolvedFilters.excluded,
        ...currentFilterClause.params,
        input.userId,
        input.range.previousFromDate.toISOString(),
        input.range.previousToDate.toISOString(),
        resolvedFilters.excluded,
        ...previousFilterClause.params,
        limit
      )) as CategoriesRow[];

    const topCategories = rows.map((row) => {
      const total = toAmount(row.total_cents);
      const previousTotal = toAmount(row.previous_total_cents);
      const categoryId = row.category_key === "uncategorized" ? null : row.category_key;

      return {
        categoryId,
        name: row.name ?? "Sem categoria",
        color: row.color ?? "#94a3b8",
        total,
        percent: toPercent(Number(row.percent ?? 0)),
        previousTotal,
        variationPercent: safeVariationPercent(total, previousTotal)
      };
    });

    return {
      from: input.range.from,
      to: input.range.to,
      topCategories
    };
  },

  async getTrends(input: {
    userId: string;
    range: DashboardDateRange;
    granularity: DashboardGranularity;
    filters?: DashboardMetricsFilters;
  }): Promise<{
    from: string;
    to: string;
    granularity: DashboardGranularity;
    series: DashboardTrendPoint[];
    previousSeries: DashboardTrendPoint[];
  }> {
    const useLedger =
      (await hasLedgerEntries({
        userId: input.userId,
        fromDate: input.range.fromDate,
        toDate: input.range.toDate
      })) ||
      (await hasLedgerEntries({
        userId: input.userId,
        fromDate: input.range.previousFromDate,
        toDate: input.range.previousToDate
      }));

    const currentMap = useLedger
      ? await aggregateTrendsRawFromLedger({
          userId: input.userId,
          fromDate: input.range.fromDate,
          toDate: input.range.toDate,
          granularity: input.granularity,
          filters: input.filters
        })
      : await aggregateTrendsRaw({
          userId: input.userId,
          fromDate: input.range.fromDate,
          toDate: input.range.toDate,
          granularity: input.granularity,
          filters: input.filters
        });

    const previousMap = useLedger
      ? await aggregateTrendsRawFromLedger({
          userId: input.userId,
          fromDate: input.range.previousFromDate,
          toDate: input.range.previousToDate,
          granularity: input.granularity,
          filters: input.filters
        })
      : await aggregateTrendsRaw({
          userId: input.userId,
          fromDate: input.range.previousFromDate,
          toDate: input.range.previousToDate,
          granularity: input.granularity,
          filters: input.filters
        });

    const currentBuckets = buildBucketSeries(input.range.fromDate, input.range.toDate, input.granularity);
    const previousBuckets = buildBucketSeries(
      input.range.previousFromDate,
      input.range.previousToDate,
      input.granularity
    );

    const series = currentBuckets.map((bucket) => {
      const values = currentMap.get(bucket) ?? { income: 0, expense: 0 };
      return {
        bucket,
        income: values.income,
        expense: values.expense,
        net: Number((values.income - values.expense).toFixed(2))
      };
    });

    const previousSeries = previousBuckets.map((bucket) => {
      const values = previousMap.get(bucket) ?? { income: 0, expense: 0 };
      return {
        bucket,
        income: values.income,
        expense: values.expense,
        net: Number((values.income - values.expense).toFixed(2))
      };
    });

    return {
      from: input.range.from,
      to: input.range.to,
      granularity: input.granularity,
      series,
      previousSeries
    };
  },

  async getPatrimony(input: {
    userId: string;
    range: DashboardDateRange;
    granularity: DashboardGranularity;
    filters?: DashboardMetricsFilters;
  }): Promise<{
    from: string;
    to: string;
    granularity: DashboardGranularity;
    series: DashboardPatrimonyPoint[];
  }> {
    const buckets = buildBucketSeries(input.range.fromDate, input.range.toDate, input.granularity);
    const baselineCents = await getPatrimonyBaselineCents({
      userId: input.userId,
      before: input.range.fromDate,
      filters: input.filters
    });
    const deltasByBucket = await getPatrimonyDeltasByBucket({
      userId: input.userId,
      fromDate: input.range.fromDate,
      toDate: input.range.toDate,
      granularity: input.granularity,
      filters: input.filters
    });

    let runningCents = baselineCents;
    const series: DashboardPatrimonyPoint[] = buckets.map((bucket) => {
      runningCents += deltasByBucket.get(bucket) ?? 0;
      return {
        bucket,
        value: toAmount(runningCents)
      };
    });

    return {
      from: input.range.from,
      to: input.range.to,
      granularity: input.granularity,
      series
    };
  }
};
