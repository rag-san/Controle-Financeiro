import { fromAmountCents } from "@/lib/finance/official-metrics";
import {
  formatUtcDate,
  isSameUtcMonth,
  utcEndOfMonth,
  utcMonthReference,
  utcStartOfMonth,
  toUtcMonthKey
} from "@/lib/finance/utc-date";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import {
  getDashboardPatrimonyCompatibilityView,
  resolveDashboardDateRange
} from "@/lib/server/dashboard-analytics.service";
import { buildSpendingTrendSeries } from "@/lib/server/dashboard-spending-trend";
import { getFinancialBreakdownSnapshot } from "@/lib/server/financial-breakdown.service";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { netWorthRepo } from "@/lib/server/net-worth.repo";
import { themeColors } from "@/src/lib/theme/colors";
import type { CategoryDTO } from "@/lib/types";
import type { NormalizedTransaction } from "@/lib/finance/normalized-transactions";

type TrendPoint = {
  day: number;
  current: number;
  previous: number;
};

type CategoryComparison = {
  categoryId: string;
  name: string;
  color: string;
  icon: string | null;
  current: number;
  previous: number;
  variation: number;
};

type DashboardPreparedEntry = {
  date: Date;
  incomeCents: number;
  expenseCents: number;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
};

type DashboardCashEntry = {
  date: Date;
  inflowCents: number;
  outflowCents: number;
};

const UNCATEGORIZED_CATEGORY_ID = "uncategorized";
export const DASHBOARD_CALCULATION_VERSION = 2;

function safeVariation(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function monthKey(date: Date): string {
  return toUtcMonthKey(date);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toPreparedNormalizedDashboardEntry(
  entry: NormalizedTransaction,
  categoriesById: Map<string, CategoryDTO>
): DashboardPreparedEntry | null {
  if (entry.excluded || entry.isBalanceAdjustment) {
    return null;
  }

  const incomeCents =
    entry.budgetImpact === "counts_as_income" ? Math.round(entry.budgetSignedAmount * 100) : 0;
  const expenseCents =
    entry.budgetImpact === "counts_as_expense" ? Math.round(-entry.budgetSignedAmount * 100) : 0;

  if (incomeCents === 0 && expenseCents === 0) {
    return null;
  }

  const category = entry.categoryId ? categoriesById.get(entry.categoryId) : null;

  return {
    date: new Date(entry.date),
    incomeCents,
    expenseCents,
    categoryId: category?.id ?? entry.categoryId ?? null,
    categoryName: category?.name?.trim() || "Sem categoria",
    categoryColor: category?.color ?? themeColors.mutedForeground,
    categoryIcon: category?.icon ?? null
  };
}

function toPreparedCashDashboardEntry(entry: NormalizedTransaction): DashboardCashEntry | null {
  if (entry.excluded || entry.isBalanceAdjustment) {
    return null;
  }

  const cashSignedAmount = entry.overallCashFlowSignedAmount;
  if (cashSignedAmount === 0) {
    return null;
  }

  return {
    date: new Date(entry.date),
    inflowCents: cashSignedAmount > 0 ? Math.round(cashSignedAmount * 100) : 0,
    outflowCents: cashSignedAmount < 0 ? Math.round(Math.abs(cashSignedAmount) * 100) : 0
  };
}

function summarizeCashEntries(entries: DashboardCashEntry[]) {
  const inflowCents = entries.reduce((sum, entry) => sum + entry.inflowCents, 0);
  const outflowCents = entries.reduce((sum, entry) => sum + entry.outflowCents, 0);
  const inflow = fromAmountCents(inflowCents);
  const outflow = fromAmountCents(outflowCents);

  return {
    income: round2(inflow),
    expense: round2(outflow),
    net: round2(inflow - outflow)
  };
}

function buildTopCategoriesFromPrepared(
  currentEntries: DashboardPreparedEntry[],
  previousEntries: DashboardPreparedEntry[],
  limit: number
): CategoryComparison[] {
  const currentByCategory = new Map<
    string,
    { totalCents: number; name: string; color: string; icon: string | null; categoryId: string }
  >();
  const previousByCategory = new Map<string, number>();

  for (const entry of currentEntries) {
    if (entry.expenseCents === 0) continue;
    const categoryId = entry.categoryId ?? UNCATEGORIZED_CATEGORY_ID;
    const current = currentByCategory.get(categoryId) ?? {
      totalCents: 0,
      name: entry.categoryName,
      color: entry.categoryColor,
      icon: entry.categoryIcon,
      categoryId
    };
    current.totalCents += entry.expenseCents;
    currentByCategory.set(categoryId, current);
  }

  for (const entry of previousEntries) {
    if (entry.expenseCents === 0) continue;
    const categoryId = entry.categoryId ?? UNCATEGORIZED_CATEGORY_ID;
    previousByCategory.set(categoryId, (previousByCategory.get(categoryId) ?? 0) + entry.expenseCents);
  }

  return [...currentByCategory.values()]
    .filter((item) => item.totalCents > 0)
    .sort((left, right) => right.totalCents - left.totalCents)
    .slice(0, limit)
    .map((item) => {
      const previousCents = previousByCategory.get(item.categoryId) ?? 0;
      const current = fromAmountCents(item.totalCents);
      const previous = fromAmountCents(previousCents);

      return {
        categoryId: item.categoryId,
        name: item.name,
        color: item.color,
        icon: item.icon,
        current: round2(current),
        previous: round2(previous),
        variation: round2(safeVariation(current, previous))
      };
    });
}

function buildCashflowFromPrepared(entries: DashboardCashEntry[]) {
  const monthlyAccumulator = new Map<string, { incomeCents: number; expenseCents: number }>();

  for (const entry of entries) {
    const key = monthKey(entry.date);
    const current = monthlyAccumulator.get(key) ?? { incomeCents: 0, expenseCents: 0 };
    current.incomeCents += entry.inflowCents;
    current.expenseCents += entry.outflowCents;
    monthlyAccumulator.set(key, current);
  }

  return [...monthlyAccumulator.entries()]
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([month, values]) => {
      const income = round2(fromAmountCents(values.incomeCents));
      const expense = round2(-fromAmountCents(values.expenseCents));
      return {
        month,
        income,
        expense,
        balance: round2(income + expense)
      };
    });
}

async function buildNetWorthForReference(input: { userId: string; referenceDate: Date; now: Date }) {
  const cutoffDate = isSameUtcMonth(input.referenceDate, input.now)
    ? input.now
    : utcEndOfMonth(input.referenceDate);
  const netWorthSeriesByDate = new Map<string, number>();
  const manualEntries = await netWorthRepo.listByUser(input.userId);
  for (const entry of manualEntries) {
    if (entry.date.getTime() > cutoffDate.getTime()) {
      continue;
    }

    const key = formatUtcDate(entry.date);
    const signedValue = entry.type === "asset" ? entry.value : -entry.value;
    netWorthSeriesByDate.set(key, (netWorthSeriesByDate.get(key) ?? 0) + signedValue);
  }

  if (netWorthSeriesByDate.size === 0) {
    const oldestLedgerDate = await ledgerRepo.oldestVisiblePostedAt({
      userId: input.userId
    });
    const oldestVisibleDate = oldestLedgerDate;

    if (oldestVisibleDate && oldestVisibleDate.getTime() <= cutoffDate.getTime()) {
      const patrimonyRangeStart = utcStartOfMonth(oldestVisibleDate);
      const patrimonyRange = resolveDashboardDateRange({
        from: patrimonyRangeStart,
        to: cutoffDate,
        now: cutoffDate
      });
      const patrimony = await getDashboardPatrimonyCompatibilityView({
        userId: input.userId,
        range: patrimonyRange,
        granularity: "day"
      });

      const patrimonySeries = patrimony.series
        .map((item) => ({
          date: item.bucket,
          value: round2(item.value)
        }))
        .filter((item) => Number.isFinite(item.value));

      if (patrimonySeries.length > 0) {
        const currentNetWorth = patrimonySeries[patrimonySeries.length - 1]?.value ?? 0;
        const previousNetWorth = patrimonySeries[patrimonySeries.length - 2]?.value ?? currentNetWorth;

        return {
          netWorthSeries: patrimonySeries,
          currentNetWorth,
          netWorthDelta: round2(currentNetWorth - previousNetWorth)
        };
      }
    }
  }

  if (netWorthSeriesByDate.size === 0 && isSameUtcMonth(input.referenceDate, input.now)) {
    const accounts = await accountsRepo.listByUserWithBalance(input.userId);
    const snapshotValue = round2(
      accounts.reduce((sum, account) => sum + (Number.isFinite(account.currentBalance ?? 0) ? account.currentBalance ?? 0 : 0), 0)
    );

    if (snapshotValue !== 0) {
      const snapshotDateKey = formatUtcDate(input.now);
      return {
        netWorthSeries: [
          {
            date: snapshotDateKey,
            value: snapshotValue
          }
        ],
        currentNetWorth: snapshotValue,
        netWorthDelta: 0
      };
    }
  }

  const netWorthSeries = [...netWorthSeriesByDate.entries()]
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([date, value]) => ({
      date,
      value: round2(value)
    }));

  const currentNetWorth = netWorthSeries[netWorthSeries.length - 1]?.value ?? 0;
  const previousNetWorth = netWorthSeries[netWorthSeries.length - 2]?.value ?? currentNetWorth;

  return {
    netWorthSeries,
    currentNetWorth,
    netWorthDelta: round2(currentNetWorth - previousNetWorth)
  };
}

type FullDashboardOptions = {
  forceReferenceDate?: boolean;
  referenceDate?: Date;
};

export const dashboardRepo = {
  async fullDashboard(userId: string, now = new Date(), options?: FullDashboardOptions) {
    const latestLedgerDate = await ledgerRepo.latestVisiblePostedAt({ userId });
    const referenceDate = options?.forceReferenceDate
      ? options.referenceDate ?? now
      : latestLedgerDate ?? now;
    const currentMonthStart = utcStartOfMonth(referenceDate);
    const currentMonthEnd = utcEndOfMonth(referenceDate);
    const previousMonthReference = utcMonthReference(referenceDate, -1);
    const previousMonthStart = utcStartOfMonth(previousMonthReference);
    const previousMonthEnd = utcEndOfMonth(previousMonthReference);
    const sixMonthsAgo = utcStartOfMonth(utcMonthReference(referenceDate, -5));
    const [categories, normalizedScope, netWorth, financeBreakdownSnapshot] = await Promise.all([
      categoriesRepo.listByUser(userId),
      loadNormalizedTransactionsForScope({
        userId,
        from: sixMonthsAgo,
        to: currentMonthEnd,
        excluded: false,
        hideCardPaymentMirrorInflow: true
      }),
      buildNetWorthForReference({
        userId,
        referenceDate,
        now
      }),
      getFinancialBreakdownSnapshot({
        userId,
        currentFrom: currentMonthStart,
        currentTo: currentMonthEnd
      })
    ]);
    const categoriesById = new Map(categories.map((item) => [item.id, item]));
    const preparedEntries = normalizedScope.entries
      .map((entry) => toPreparedNormalizedDashboardEntry(entry, categoriesById))
      .filter((entry): entry is DashboardPreparedEntry => entry !== null);
    const cashEntries = normalizedScope.entries
      .map(toPreparedCashDashboardEntry)
      .filter((entry): entry is DashboardCashEntry => entry !== null);
    const currentEntries = preparedEntries.filter(
      (entry) => entry.date.getTime() >= currentMonthStart.getTime() && entry.date.getTime() <= currentMonthEnd.getTime()
    );
    const previousEntries = preparedEntries.filter(
      (entry) => entry.date.getTime() >= previousMonthStart.getTime() && entry.date.getTime() <= previousMonthEnd.getTime()
    );
    const currentCashEntries = cashEntries.filter(
      (entry) => entry.date.getTime() >= currentMonthStart.getTime() && entry.date.getTime() <= currentMonthEnd.getTime()
    );
    const previousCashEntries = cashEntries.filter(
      (entry) => entry.date.getTime() >= previousMonthStart.getTime() && entry.date.getTime() <= previousMonthEnd.getTime()
    );
    const currentSummary = summarizeCashEntries(currentCashEntries);
    const previousSummary = summarizeCashEntries(previousCashEntries);
    const spendingTrendSeries = buildSpendingTrendSeries({
      currentTransactions: currentCashEntries
        .filter((entry) => entry.outflowCents !== 0)
        .map((entry) => ({
          date: entry.date,
          amount: -fromAmountCents(entry.outflowCents),
          type: "expense"
        })),
      previousTransactions: previousCashEntries
        .filter((entry) => entry.outflowCents !== 0)
        .map((entry) => ({
          date: entry.date,
          amount: -fromAmountCents(entry.outflowCents),
          type: "expense"
        })),
      referenceDate,
      now
    });
    const spendingTrend: TrendPoint[] = spendingTrendSeries.accumulated;
    const topCategories = buildTopCategoriesFromPrepared(currentEntries, previousEntries, 8);
    const cashflow = buildCashflowFromPrepared(cashEntries);
    const financeBreakdown = financeBreakdownSnapshot.breakdown;

    return {
      dashboardCalculationVersion: DASHBOARD_CALCULATION_VERSION,
      referenceMonth: monthKey(referenceDate),
      previousReferenceMonth: monthKey(previousMonthReference),
      referencePeriod: {
        start: currentMonthStart.toISOString(),
        end: currentMonthEnd.toISOString()
      },
      comparisonPeriod: {
        start: previousMonthStart.toISOString(),
        end: previousMonthEnd.toISOString()
      },
      isCurrentMonthReference: isSameUtcMonth(referenceDate, now),
      cards: {
        income: currentSummary.income,
        expense: currentSummary.expense,
        result: currentSummary.net,
        netWorth: netWorth.currentNetWorth,
        spendPaceDelta: round2(safeVariation(currentSummary.expense, previousSummary.expense)),
        resultDelta: round2(safeVariation(currentSummary.net, previousSummary.net))
      },
      periodComparison: {
        current: {
          income: currentSummary.income,
          expense: currentSummary.expense,
          result: currentSummary.net,
          excluded: 0
        },
        previous: {
          income: previousSummary.income,
          expense: previousSummary.expense,
          result: previousSummary.net,
          excluded: 0
        }
      },
      netWorthDelta: netWorth.netWorthDelta,
      netWorthSeries: netWorth.netWorthSeries,
      spendingTrend,
      spendingTrendDaily: spendingTrendSeries.daily,
      spendingTrendMeta: {
        compareUntilDay: spendingTrendSeries.compareUntilDay
      },
      topCategories,
      cashflow,
      financeBreakdown
    };
  }
};
