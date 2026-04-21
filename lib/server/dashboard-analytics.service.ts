import {
  formatUtcDate,
  isSameUtcMonth,
  utcEndOfDay,
  utcEndOfMonth,
  utcMonthReference,
  utcStartOfDay,
  utcStartOfMonth
} from "@/lib/finance/utc-date";
import { type FinancialAccountType, type NormalizedTransaction } from "@/lib/finance/normalized-transactions";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";
import { getDashboardSummaryView, type DashboardSummaryView } from "@/lib/server/dashboard-summary.service";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { themeColors } from "@/src/lib/theme/colors";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNCATEGORIZED_KEY = "__uncategorized";
const CATEGORY_FALLBACK_COLOR = themeColors.mutedForeground;

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
  cashInflow: number;
  cashOutflow: number;
  cashNet: number;
  excludedTotal: number;
  previousPeriodComparison: {
    delta: number;
    percent: number;
    previousNet: number;
    previousIncome: number;
    previousExpense: number;
    previousCashInflow: number;
    previousCashOutflow: number;
    previousCashNet: number;
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

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function safeVariationPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

function toTimestamp(value: string): number | null {
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function inRange(timestamp: number, from: Date, to: Date): boolean {
  return timestamp >= from.getTime() && timestamp <= to.getTime();
}

function isCashAccount(type: FinancialAccountType | null | undefined): boolean {
  return type === "checking" || type === "cash";
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function floorBucket(date: Date, granularity: DashboardGranularity): Date {
  const base = utcStartOfDay(date);
  if (granularity === "day") return base;

  if (granularity === "week") {
    const jsWeekday = base.getUTCDay();
    const mondayOffset = jsWeekday === 0 ? -6 : 1 - jsWeekday;
    return utcStartOfDay(addDays(base, mondayOffset));
  }

  return utcStartOfMonth(base);
}

function addBucket(date: Date, granularity: DashboardGranularity): Date {
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  return utcStartOfMonth(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
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

function resolveCategoryMeta(
  categoryId: string | null,
  categoriesById: Map<string, { name: string; color: string }>
): { categoryId: string | null; name: string; color: string } {
  if (!categoryId) {
    return {
      categoryId: null,
      name: "Sem categoria",
      color: CATEGORY_FALLBACK_COLOR
    };
  }

  const category = categoriesById.get(categoryId);
  return {
    categoryId,
    name: category?.name ?? "Sem categoria",
    color: category?.color ?? CATEGORY_FALLBACK_COLOR
  };
}

function shouldCountForBudget(entry: NormalizedTransaction, excluded: boolean): boolean {
  if (entry.isBalanceAdjustment) return false;
  if (excluded) return entry.excluded;
  return !entry.excluded;
}

function shouldCountForPatrimony(entry: NormalizedTransaction, excluded: boolean): boolean {
  if (excluded) return entry.excluded;
  if (entry.isBalanceAdjustment) return true;
  return !entry.excluded;
}

function toBudgetIncome(entry: NormalizedTransaction): number {
  if (entry.budgetImpact !== "counts_as_income") return 0;
  return entry.budgetSignedAmount;
}

function toBudgetExpense(entry: NormalizedTransaction): number {
  if (entry.budgetImpact !== "counts_as_expense") return 0;
  return -entry.budgetSignedAmount;
}

function toPatrimonyDelta(
  entry: NormalizedTransaction,
  excluded: boolean,
  scopedAccountId: string | null
): number {
  if (!shouldCountForPatrimony(entry, excluded)) return 0;
  if (!isCashAccount(entry.accountType)) return 0;
  if (scopedAccountId && entry.accountId !== scopedAccountId) return 0;
  return entry.accountBalanceSignedAmount;
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
    const previousMonthReference = utcMonthReference(fromDate, -1);
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
    const totalDays = Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
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

export async function getDashboardSummaryCompatibilityView(input: {
  userId: string;
  range: DashboardDateRange;
  filters?: DashboardMetricsFilters;
}): Promise<DashboardSummaryView> {
  return getDashboardSummaryView(input);
}

export async function getDashboardCategoriesCompatibilityView(input: {
  userId: string;
  range: DashboardDateRange;
  limit?: number;
  filters?: DashboardMetricsFilters;
}): Promise<{ from: string; to: string; topCategories: DashboardCategory[] }> {
  const limit = input.limit ?? 8;
  if (input.filters?.type && input.filters.type !== "expense") {
    return {
      from: input.range.from,
      to: input.range.to,
      topCategories: []
    };
  }

  const [categories, normalizedScope] = await Promise.all([
    categoriesRepo.listByUser(input.userId),
    loadNormalizedTransactionsForScope({
      userId: input.userId,
      from: input.range.previousFromDate,
      to: input.range.toDate,
      accountId: input.filters?.accountId,
      categoryId: input.filters?.categoryId,
      transactionType: "expense",
      excluded: input.filters?.excluded ?? false,
      normalizedQuery: input.filters?.normalizedQuery,
      hideCardPaymentMirrorInflow: true
    })
  ]);

  const categoriesById = new Map(
    categories.map((category) => [category.id, { name: category.name, color: category.color }])
  );
  const excluded = input.filters?.excluded ?? false;
  const currentTotals = new Map<string, number>();
  const previousTotals = new Map<string, number>();

  for (const entry of normalizedScope.entries) {
    if (!shouldCountForBudget(entry, excluded)) continue;
    const expenseAmount = toBudgetExpense(entry);
    if (expenseAmount === 0) continue;

    const timestamp = toTimestamp(entry.date);
    if (timestamp === null) continue;

    const key = entry.categoryId ?? UNCATEGORIZED_KEY;
    if (inRange(timestamp, input.range.fromDate, input.range.toDate)) {
      currentTotals.set(key, round2((currentTotals.get(key) ?? 0) + expenseAmount));
    }
    if (inRange(timestamp, input.range.previousFromDate, input.range.previousToDate)) {
      previousTotals.set(key, round2((previousTotals.get(key) ?? 0) + expenseAmount));
    }
  }

  const currentRows = [...currentTotals.entries()]
    .map(([key, total]) => ({
      key,
      total
    }))
    .filter((row) => row.total > 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, limit);

  if (currentRows.length > 0) {
    const overall = currentRows.reduce((sum, row) => sum + row.total, 0);
    const topCategories = currentRows.map((row) => {
      const resolved = resolveCategoryMeta(
        row.key === UNCATEGORIZED_KEY ? null : row.key,
        categoriesById
      );
      const previousTotal = previousTotals.get(row.key) ?? 0;

      return {
        categoryId: resolved.categoryId,
        name: resolved.name,
        color: resolved.color,
        total: round2(row.total),
        percent: overall <= 0 ? 0 : round2((row.total / overall) * 100),
        previousTotal: round2(previousTotal),
        variationPercent: safeVariationPercent(row.total, previousTotal)
      } satisfies DashboardCategory;
    });

    return {
      from: input.range.from,
      to: input.range.to,
      topCategories
    };
  }

  const previousOnlyRows = [...previousTotals.entries()]
    .map(([key, total]) => ({ key, total }))
    .filter((row) => row.total > 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, limit)
    .map((row) => {
      const resolved = resolveCategoryMeta(
        row.key === UNCATEGORIZED_KEY ? null : row.key,
        categoriesById
      );

      return {
        categoryId: resolved.categoryId,
        name: resolved.name,
        color: resolved.color,
        total: 0,
        percent: 0,
        previousTotal: round2(row.total),
        variationPercent: safeVariationPercent(0, row.total)
      } satisfies DashboardCategory;
    });

  return {
    from: input.range.from,
    to: input.range.to,
    topCategories: previousOnlyRows
  };
}

export async function getDashboardTrendsCompatibilityView(input: {
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
  const normalizedScope = await loadNormalizedTransactionsForScope({
    userId: input.userId,
    from: input.range.previousFromDate,
    to: input.range.toDate,
    accountId: input.filters?.accountId,
    categoryId: input.filters?.categoryId,
    transactionType: input.filters?.type,
    excluded: input.filters?.excluded ?? false,
    normalizedQuery: input.filters?.normalizedQuery,
    hideCardPaymentMirrorInflow: true
  });
  const excluded = input.filters?.excluded ?? false;
  const currentMap = new Map<string, { income: number; expense: number }>();
  const previousMap = new Map<string, { income: number; expense: number }>();

  for (const entry of normalizedScope.entries) {
    if (!shouldCountForBudget(entry, excluded)) continue;

    const timestamp = toTimestamp(entry.date);
    if (timestamp === null) continue;
    const income = toBudgetIncome(entry);
    const expense = toBudgetExpense(entry);

    if (income === 0 && expense === 0) continue;

    const date = new Date(timestamp);
    const bucket = formatUtcDate(floorBucket(date, input.granularity));

    if (inRange(timestamp, input.range.fromDate, input.range.toDate)) {
      const current = currentMap.get(bucket) ?? { income: 0, expense: 0 };
      current.income = round2(current.income + income);
      current.expense = round2(current.expense + expense);
      currentMap.set(bucket, current);
    }

    if (inRange(timestamp, input.range.previousFromDate, input.range.previousToDate)) {
      const previous = previousMap.get(bucket) ?? { income: 0, expense: 0 };
      previous.income = round2(previous.income + income);
      previous.expense = round2(previous.expense + expense);
      previousMap.set(bucket, previous);
    }
  }

  const series = buildBucketSeries(input.range.fromDate, input.range.toDate, input.granularity).map((bucket) => {
    const values = currentMap.get(bucket) ?? { income: 0, expense: 0 };
    return {
      bucket,
      income: round2(values.income),
      expense: round2(values.expense),
      net: round2(values.income - values.expense)
    };
  });

  const previousSeries = buildBucketSeries(
    input.range.previousFromDate,
    input.range.previousToDate,
    input.granularity
  ).map((bucket) => {
    const values = previousMap.get(bucket) ?? { income: 0, expense: 0 };
    return {
      bucket,
      income: round2(values.income),
      expense: round2(values.expense),
      net: round2(values.income - values.expense)
    };
  });

  return {
    from: input.range.from,
    to: input.range.to,
    granularity: input.granularity,
    series,
    previousSeries
  };
}

export async function getDashboardPatrimonyCompatibilityView(input: {
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
  const normalizedScope = await loadNormalizedTransactionsForScope({
    userId: input.userId,
    to: input.range.toDate,
    accountId: input.filters?.accountId,
    categoryId: input.filters?.categoryId,
    transactionType: input.filters?.type,
    excluded: input.filters?.excluded ?? false,
    normalizedQuery: input.filters?.normalizedQuery,
    hideCardPaymentMirrorInflow: true,
    includeBalanceAdjustments: true
  });
  const excluded = input.filters?.excluded ?? false;
  const deltasByBucket = new Map<string, number>();
  let baseline = 0;
  const scopedAccountId = input.filters?.accountId ?? null;

  for (const entry of normalizedScope.entries) {
    const timestamp = toTimestamp(entry.date);
    if (timestamp === null) continue;

    const delta = toPatrimonyDelta(entry, excluded, scopedAccountId);
    if (delta === 0) continue;

    if (timestamp < input.range.fromDate.getTime()) {
      baseline = round2(baseline + delta);
      continue;
    }

    if (!inRange(timestamp, input.range.fromDate, input.range.toDate)) {
      continue;
    }

    const bucket = formatUtcDate(floorBucket(new Date(timestamp), input.granularity));
    deltasByBucket.set(bucket, round2((deltasByBucket.get(bucket) ?? 0) + delta));
  }

  let running = baseline;
  const series = buildBucketSeries(input.range.fromDate, input.range.toDate, input.granularity).map(
    (bucket) => {
      running = round2(running + (deltasByBucket.get(bucket) ?? 0));
      return {
        bucket,
        value: running
      };
    }
  );

  return {
    from: input.range.from,
    to: input.range.to,
    granularity: input.granularity,
    series
  };
}

export async function getDashboardOverviewCompatibilityView(input: {
  userId: string;
  range: DashboardDateRange;
  filters?: DashboardMetricsFilters;
}) {
  const [summary, categories, trends, patrimony] = await Promise.all([
    getDashboardSummaryCompatibilityView(input),
    getDashboardCategoriesCompatibilityView({
      userId: input.userId,
      range: input.range,
      limit: 5,
      filters: input.filters
    }),
    getDashboardTrendsCompatibilityView({
      userId: input.userId,
      range: input.range,
      granularity: "day",
      filters: input.filters
    }),
    getDashboardPatrimonyCompatibilityView({
      userId: input.userId,
      range: input.range,
      granularity: "day",
      filters: input.filters
    })
  ]);

  return {
    from: input.range.from,
    to: input.range.to,
    summary,
    categories: categories.topCategories,
    trends,
    patrimony
  };
}
