import { endOfMonth, format, isSameMonth, startOfMonth, subMonths } from "date-fns";
import { fromAmountCents } from "@/lib/finance/official-metrics";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";
import { dashboardMetricsRepo } from "@/lib/server/dashboard-metrics.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { buildSpendingTrendSeries } from "@/lib/server/dashboard-spending-trend";
import { getFinancialBreakdownSnapshot } from "@/lib/server/financial-breakdown.service";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { netWorthRepo } from "@/lib/server/net-worth.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";
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

const UNCATEGORIZED_CATEGORY_ID = "uncategorized";

function safeVariation(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
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

function summarizePreparedEntries(entries: DashboardPreparedEntry[]) {
  const incomeCents = entries.reduce((sum, entry) => sum + entry.incomeCents, 0);
  const expenseCents = entries.reduce((sum, entry) => sum + entry.expenseCents, 0);
  const income = fromAmountCents(incomeCents);
  const expense = fromAmountCents(expenseCents);

  return {
    income: round2(income),
    expense: round2(expense),
    net: round2(income - expense)
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

function buildCashflowFromPrepared(entries: DashboardPreparedEntry[]) {
  const monthlyAccumulator = new Map<string, { incomeCents: number; expenseCents: number }>();

  for (const entry of entries) {
    const key = monthKey(entry.date);
    const current = monthlyAccumulator.get(key) ?? { incomeCents: 0, expenseCents: 0 };
    current.incomeCents += entry.incomeCents;
    current.expenseCents += entry.expenseCents;
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
  const cutoffDate = isSameMonth(input.referenceDate, input.now)
    ? input.now
    : endOfMonth(input.referenceDate);
  const netWorthSeriesByDate = new Map<string, number>();
  const manualEntries = await netWorthRepo.listByUser(input.userId);
  for (const entry of manualEntries) {
    if (entry.date.getTime() > cutoffDate.getTime()) {
      continue;
    }

    const key = format(entry.date, "yyyy-MM-dd");
    const signedValue = entry.type === "asset" ? entry.value : -entry.value;
    netWorthSeriesByDate.set(key, (netWorthSeriesByDate.get(key) ?? 0) + signedValue);
  }

  if (netWorthSeriesByDate.size === 0) {
    const oldestLedgerDate = await ledgerRepo.oldestVisiblePostedAt({
      userId: input.userId
    });
    const oldestTransactionDate = oldestLedgerDate
      ? null
      : await transactionsRepo.oldestPostedAt(input.userId, {
          excluded: false
        });
    const oldestVisibleDate = oldestLedgerDate ?? oldestTransactionDate;

    if (oldestVisibleDate && oldestVisibleDate.getTime() <= cutoffDate.getTime()) {
      const patrimonyRangeStart = startOfMonth(oldestVisibleDate);
      const patrimony = await dashboardMetricsRepo.getPatrimony({
        userId: input.userId,
        range: {
          fromDate: patrimonyRangeStart,
          toDate: cutoffDate,
          previousFromDate: patrimonyRangeStart,
          previousToDate: cutoffDate,
          from: patrimonyRangeStart.toISOString(),
          to: cutoffDate.toISOString(),
          previousFrom: patrimonyRangeStart.toISOString(),
          previousTo: cutoffDate.toISOString()
        },
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

  if (netWorthSeriesByDate.size === 0 && isSameMonth(input.referenceDate, input.now)) {
    const accounts = await accountsRepo.listByUserWithBalance(input.userId);
    const snapshotValue = round2(
      accounts.reduce((sum, account) => sum + (Number.isFinite(account.currentBalance ?? 0) ? account.currentBalance ?? 0 : 0), 0)
    );

    if (snapshotValue !== 0) {
      const snapshotDateKey = format(input.now, "yyyy-MM-dd");
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
  async summaryByRange(userId: string, from: Date, to: Date) {
    const [categories, normalizedScope] = await Promise.all([
      categoriesRepo.listByUser(userId),
      loadNormalizedTransactionsForScope({
        userId,
        from,
        to,
        excluded: false,
        hideCardPaymentMirrorInflow: true
      })
    ]);
    const categoriesById = new Map(categories.map((item) => [item.id, item]));
    const entries = normalizedScope.entries
      .map((entry) => toPreparedNormalizedDashboardEntry(entry, categoriesById))
      .filter((entry): entry is DashboardPreparedEntry => entry !== null);
    const totals = summarizePreparedEntries(entries);
    const topCategories = buildTopCategoriesFromPrepared(entries, [], 12);
    const byCategory = topCategories.map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      color: item.color,
      expenseCents: Math.round(item.current * 100)
    }));

    return {
      totals: {
        income: Math.round(totals.income * 100),
        expenses: Math.round(totals.expense * 100),
        net: Math.round(totals.net * 100)
      },
      byCategory
    };
  },

  async fullDashboard(userId: string, now = new Date(), options?: FullDashboardOptions) {
    const latestTransactionDate = await transactionsRepo.latestPostedAt(userId, { excluded: false });
    const latestLedgerDate = await ledgerRepo.latestVisiblePostedAt({ userId });
    const referenceDate = options?.forceReferenceDate
      ? options.referenceDate ?? now
      : latestLedgerDate && latestTransactionDate
        ? latestLedgerDate.getTime() >= latestTransactionDate.getTime()
          ? latestLedgerDate
          : latestTransactionDate
        : latestLedgerDate ?? latestTransactionDate ?? now;
    const currentMonthStart = startOfMonth(referenceDate);
    const currentMonthEnd = endOfMonth(referenceDate);
    const previousMonthStart = startOfMonth(subMonths(referenceDate, 1));
    const previousMonthEnd = endOfMonth(subMonths(referenceDate, 1));
    const sixMonthsAgo = startOfMonth(subMonths(referenceDate, 5));
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
    const currentEntries = preparedEntries.filter(
      (entry) => entry.date.getTime() >= currentMonthStart.getTime() && entry.date.getTime() <= currentMonthEnd.getTime()
    );
    const previousEntries = preparedEntries.filter(
      (entry) => entry.date.getTime() >= previousMonthStart.getTime() && entry.date.getTime() <= previousMonthEnd.getTime()
    );
    const currentSummary = summarizePreparedEntries(currentEntries);
    const previousSummary = summarizePreparedEntries(previousEntries);
    const spendingTrendSeries = buildSpendingTrendSeries({
      currentTransactions: currentEntries
        .filter((entry) => entry.expenseCents !== 0)
        .map((entry) => ({
          date: entry.date,
          amount: -fromAmountCents(entry.expenseCents),
          type: "expense"
        })),
      previousTransactions: previousEntries
        .filter((entry) => entry.expenseCents !== 0)
        .map((entry) => ({
          date: entry.date,
          amount: -fromAmountCents(entry.expenseCents),
          type: "expense"
        })),
      referenceDate,
      now
    });
    const spendingTrend: TrendPoint[] = spendingTrendSeries.accumulated;
    const topCategories = buildTopCategoriesFromPrepared(currentEntries, previousEntries, 8);
    const cashflow = buildCashflowFromPrepared(preparedEntries);
    const financeBreakdown = financeBreakdownSnapshot.breakdown;

    return {
      referenceMonth: monthKey(referenceDate),
      previousReferenceMonth: monthKey(subMonths(referenceDate, 1)),
      referencePeriod: {
        start: currentMonthStart.toISOString(),
        end: currentMonthEnd.toISOString()
      },
      comparisonPeriod: {
        start: previousMonthStart.toISOString(),
        end: previousMonthEnd.toISOString()
      },
      isCurrentMonthReference: isSameMonth(referenceDate, now),
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
