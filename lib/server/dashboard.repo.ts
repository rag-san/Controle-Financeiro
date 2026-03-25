import { endOfMonth, format, isSameMonth, startOfMonth, subMonths } from "date-fns";
import { absAmountCents, accumulateOfficialFlowCents, fromAmountCents } from "@/lib/finance/official-metrics";
import { shouldUseLedgerForAnalytics } from "@/lib/server/analytics-source";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { buildSpendingTrendSeries } from "@/lib/server/dashboard-spending-trend";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { netWorthRepo } from "@/lib/server/net-worth.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";
import { themeColors } from "@/src/lib/theme/colors";

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

type LedgerDashboardEntry = Awaited<ReturnType<typeof ledgerRepo.listAnalyticsEntries>>[number];

type DashboardPreparedEntry = {
  date: Date;
  incomeCents: number;
  expenseCents: number;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
};

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

function toPreparedLedgerDashboardEntry(entry: LedgerDashboardEntry): DashboardPreparedEntry | null {
  if (entry.type === "income" || entry.type === "refund") {
    return {
      date: entry.postedAt,
      incomeCents: entry.amountCents,
      expenseCents: 0,
      categoryId: entry.categoryId ?? null,
      categoryName: entry.category?.name?.trim() || "Sem categoria",
      categoryColor: entry.category?.color ?? themeColors.mutedForeground,
      categoryIcon: entry.category?.icon ?? null
    };
  }

  if (entry.type === "expense" || entry.type === "cc_purchase" || entry.type === "fee") {
    return {
      date: entry.postedAt,
      incomeCents: 0,
      expenseCents: entry.amountCents,
      categoryId: entry.categoryId ?? null,
      categoryName: entry.category?.name?.trim() || "Sem categoria",
      categoryColor: entry.category?.color ?? themeColors.mutedForeground,
      categoryIcon: entry.category?.icon ?? null
    };
  }

  return null;
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
    if (entry.expenseCents <= 0 || !entry.categoryId) continue;
    const current = currentByCategory.get(entry.categoryId) ?? {
      totalCents: 0,
      name: entry.categoryName,
      color: entry.categoryColor,
      icon: entry.categoryIcon,
      categoryId: entry.categoryId
    };
    current.totalCents += entry.expenseCents;
    currentByCategory.set(entry.categoryId, current);
  }

  for (const entry of previousEntries) {
    if (entry.expenseCents <= 0 || !entry.categoryId) continue;
    previousByCategory.set(entry.categoryId, (previousByCategory.get(entry.categoryId) ?? 0) + entry.expenseCents);
  }

  return [...currentByCategory.values()]
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

async function buildNetWorth(userId: string) {
  const netWorthSeriesByDate = new Map<string, number>();
  for (const entry of await netWorthRepo.listByUser(userId)) {
    const key = format(entry.date, "yyyy-MM-dd");
    const signedValue = entry.type === "asset" ? entry.value : -entry.value;
    netWorthSeriesByDate.set(key, (netWorthSeriesByDate.get(key) ?? 0) + signedValue);
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
    const useLedger = await shouldUseLedgerForAnalytics({
      userId,
      from,
      to,
      transactionTypes: ["income", "expense"]
    });

    if (useLedger) {
      const entries = (await ledgerRepo.listAnalyticsEntries({
        userId,
        from,
        to
      }))
        .map((entry) => toPreparedLedgerDashboardEntry(entry))
        .filter((entry): entry is DashboardPreparedEntry => entry !== null);
      const totals = summarizePreparedEntries(entries);
      const byCategoryMap = new Map<string, { totalCents: number; name: string; color: string }>();

      for (const entry of entries) {
        if (entry.expenseCents <= 0) continue;
        const categoryId = entry.categoryId ?? "uncategorized";
        const current = byCategoryMap.get(categoryId) ?? {
          totalCents: 0,
          name: entry.categoryName,
          color: entry.categoryColor
        };
        current.totalCents += entry.expenseCents;
        byCategoryMap.set(categoryId, current);
      }

      const byCategory = [...byCategoryMap.entries()]
        .sort((a, b) => b[1].totalCents - a[1].totalCents)
        .slice(0, 12)
        .map(([categoryId, value]) => ({
          categoryId,
          name: value.name,
          color: value.color,
          expenseCents: value.totalCents
        }));

      return {
        totals: {
          income: Math.round(totals.income * 100),
          expenses: Math.round(totals.expense * 100),
          net: Math.round(totals.net * 100)
        },
        byCategory
      };
    }

    const txs = (await transactionsRepo.listByDateRange(userId, from, to, true)).filter(
      (transaction) => !transaction.excluded
    );
    const totals = accumulateOfficialFlowCents(txs.map((tx) => ({ type: tx.type, amount: tx.amount })));
    const byCategoryMap = new Map<string, { totalCents: number; name: string; color: string }>();

    const categories = await categoriesRepo.listByUser(userId);
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    for (const tx of txs) {
      if (tx.type !== "expense") continue;
      const absCents = absAmountCents(tx.amount);
      if (absCents <= 0) continue;

      const categoryId = tx.categoryId ?? "uncategorized";
      const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
      const current = byCategoryMap.get(categoryId) ?? {
        totalCents: 0,
        name: category?.name ?? "Sem categoria",
        color: category?.color ?? themeColors.mutedForeground
      };
      current.totalCents += absCents;
      byCategoryMap.set(categoryId, current);
    }

    const byCategory = [...byCategoryMap.entries()]
      .sort((a, b) => b[1].totalCents - a[1].totalCents)
      .slice(0, 12)
      .map(([categoryId, value]) => ({
        categoryId,
        name: value.name,
        color: value.color,
        expenseCents: value.totalCents
      }));

    return {
      totals: {
        income: totals.incomeCents,
        expenses: totals.expenseCents,
        net: totals.netCents
      },
      byCategory
    };
  },

  async fullDashboard(userId: string, now = new Date(), options?: FullDashboardOptions) {
    const latestTransactionDate = await transactionsRepo.latestPostedAt(userId, { excluded: false });
    const latestLedgerDate = await ledgerRepo.latestVisiblePostedAt({ userId });
    let referenceDate = options?.forceReferenceDate
      ? options.referenceDate ?? now
      : latestLedgerDate ?? latestTransactionDate ?? now;
    let currentMonthStart = startOfMonth(referenceDate);
    let currentMonthEnd = endOfMonth(referenceDate);
    let previousMonthStart = startOfMonth(subMonths(referenceDate, 1));
    let previousMonthEnd = endOfMonth(subMonths(referenceDate, 1));
    let sixMonthsAgo = startOfMonth(subMonths(referenceDate, 5));
    const useLedger = await shouldUseLedgerForAnalytics({
      userId,
      from: sixMonthsAgo,
      to: currentMonthEnd,
      transactionTypes: ["income", "expense"]
    });

    if (!useLedger && !options?.forceReferenceDate) {
      referenceDate = latestTransactionDate ?? referenceDate;
      currentMonthStart = startOfMonth(referenceDate);
      currentMonthEnd = endOfMonth(referenceDate);
      previousMonthStart = startOfMonth(subMonths(referenceDate, 1));
      previousMonthEnd = endOfMonth(subMonths(referenceDate, 1));
      sixMonthsAgo = startOfMonth(subMonths(referenceDate, 5));
    }

    if (useLedger) {
      const preparedEntries = (await ledgerRepo.listAnalyticsEntries({
        userId,
        from: sixMonthsAgo,
        to: currentMonthEnd
      }))
        .map((entry) => toPreparedLedgerDashboardEntry(entry))
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
          .filter((entry) => entry.expenseCents > 0)
          .map((entry) => ({
            date: entry.date,
            amount: -fromAmountCents(entry.expenseCents),
            type: "expense"
          })),
        previousTransactions: previousEntries
          .filter((entry) => entry.expenseCents > 0)
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
      const netWorth = await buildNetWorth(userId);

      return {
        referenceMonth: monthKey(referenceDate),
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
        cashflow
      };
    }

    const currentTransactions = (await transactionsRepo.listByDateRange(
      userId,
      currentMonthStart,
      currentMonthEnd,
      true
    )).filter((transaction) => !transaction.excluded);
    const previousTransactions = (await transactionsRepo.listByDateRange(
      userId,
      previousMonthStart,
      previousMonthEnd,
      true
    )).filter((transaction) => !transaction.excluded);
    const monthlyTransactions = (await transactionsRepo.listByDateRange(
      userId,
      sixMonthsAgo,
      currentMonthEnd,
      false
    )).filter((transaction) => !transaction.excluded);

    const monthSummary = accumulateOfficialFlowCents(
      currentTransactions.map((tx) => ({ type: tx.type, amount: tx.amount }))
    );
    const previousSummary = accumulateOfficialFlowCents(
      previousTransactions.map((tx) => ({ type: tx.type, amount: tx.amount }))
    );

    const spendingTrendSeries = buildSpendingTrendSeries({
      currentTransactions,
      previousTransactions,
      referenceDate,
      now
    });
    const spendingTrend: TrendPoint[] = spendingTrendSeries.accumulated;

    const categories = await categoriesRepo.listByUser(userId);
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    const currentByCategory = new Map<string, number>();
    const previousByCategory = new Map<string, number>();

    for (const tx of currentTransactions) {
      if (!tx.categoryId || tx.type !== "expense") continue;
      currentByCategory.set(tx.categoryId, (currentByCategory.get(tx.categoryId) ?? 0) + absAmountCents(tx.amount));
    }

    for (const tx of previousTransactions) {
      if (!tx.categoryId || tx.type !== "expense") continue;
      previousByCategory.set(tx.categoryId, (previousByCategory.get(tx.categoryId) ?? 0) + absAmountCents(tx.amount));
    }

    const topCategories: CategoryComparison[] = [...currentByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([categoryId, total]) => {
        const previous = previousByCategory.get(categoryId) ?? 0;
        const category = categoryById.get(categoryId);
        const totalAmount = fromAmountCents(total);
        const previousAmount = fromAmountCents(previous);

        return {
          categoryId,
          name: category?.name ?? "Sem categoria",
          color: category?.color ?? themeColors.mutedForeground,
          icon: category?.icon ?? null,
          current: round2(totalAmount),
          previous: round2(previousAmount),
          variation: round2(safeVariation(totalAmount, previousAmount))
        };
      });

    const monthlyAccumulator = new Map<string, { incomeCents: number; expenseCents: number }>();
    for (const tx of monthlyTransactions) {
      const key = monthKey(tx.date);
      const current = monthlyAccumulator.get(key) ?? { incomeCents: 0, expenseCents: 0 };

      if (tx.type === "income") {
        current.incomeCents += absAmountCents(tx.amount);
      } else if (tx.type === "expense") {
        current.expenseCents += absAmountCents(tx.amount);
      }

      monthlyAccumulator.set(key, current);
    }

    const cashflow = [...monthlyAccumulator.entries()]
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

    const netWorth = await buildNetWorth(userId);
    const monthIncome = fromAmountCents(monthSummary.incomeCents);
    const monthExpense = fromAmountCents(monthSummary.expenseCents);
    const previousIncome = fromAmountCents(previousSummary.incomeCents);
    const previousExpense = fromAmountCents(previousSummary.expenseCents);
    const currentResult = fromAmountCents(monthSummary.netCents);
    const previousResult = fromAmountCents(previousSummary.netCents);

    return {
      referenceMonth: monthKey(referenceDate),
      isCurrentMonthReference: isSameMonth(referenceDate, now),
      cards: {
        income: round2(monthIncome),
        expense: round2(monthExpense),
        result: round2(currentResult),
        netWorth: netWorth.currentNetWorth,
        spendPaceDelta: round2(safeVariation(monthExpense, previousExpense)),
        resultDelta: round2(safeVariation(currentResult, previousResult))
      },
      periodComparison: {
        current: {
          income: round2(monthIncome),
          expense: round2(monthExpense),
          result: round2(currentResult),
          excluded: 0
        },
        previous: {
          income: round2(previousIncome),
          expense: round2(previousExpense),
          result: round2(previousResult),
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
      cashflow
    };
  }
};
