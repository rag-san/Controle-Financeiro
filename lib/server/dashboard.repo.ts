import { endOfMonth, format, isSameMonth, startOfMonth, subMonths } from "date-fns";
import { absAmountCents, accumulateOfficialFlowCents, fromAmountCents } from "@/lib/finance/official-metrics";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { netWorthRepo } from "@/lib/server/net-worth.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

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

function safeVariation(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function dayOfMonth(date: Date): number {
  return Number(date.toISOString().slice(8, 10));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export const dashboardRepo = {
  async summaryByRange(userId: string, from: Date, to: Date) {
    const txs = await transactionsRepo.listByDateRange(userId, from, to, true);
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
        color: category?.color ?? "#94a3b8"
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

  async fullDashboard(userId: string, now = new Date(), options?: { forceReferenceDate?: boolean }) {
    const latestTransactionDate = await transactionsRepo.latestPostedAt(userId);
    const referenceDate = options?.forceReferenceDate ? now : latestTransactionDate ?? now;
    const currentMonthStart = startOfMonth(referenceDate);
    const currentMonthEnd = endOfMonth(referenceDate);
    const previousMonthStart = startOfMonth(subMonths(referenceDate, 1));
    const previousMonthEnd = endOfMonth(subMonths(referenceDate, 1));
    const sixMonthsAgo = startOfMonth(subMonths(referenceDate, 5));

    const currentTransactions = await transactionsRepo.listByDateRange(userId, currentMonthStart, currentMonthEnd, true);
    const previousTransactions = await transactionsRepo.listByDateRange(userId, previousMonthStart, previousMonthEnd, true);
    const monthlyTransactions = await transactionsRepo.listByDateRange(userId, sixMonthsAgo, currentMonthEnd, false);

    const monthSummary = accumulateOfficialFlowCents(
      currentTransactions.map((tx) => ({ type: tx.type, amount: tx.amount }))
    );
    const previousSummary = accumulateOfficialFlowCents(
      previousTransactions.map((tx) => ({ type: tx.type, amount: tx.amount }))
    );

    const maxDays = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
    const currentDayTotals = new Map<number, number>();
    const previousDayTotals = new Map<number, number>();

    for (const tx of currentTransactions) {
      if (tx.type !== "expense") continue;
      const day = dayOfMonth(tx.date);
      const current = currentDayTotals.get(day) ?? 0;
      currentDayTotals.set(day, current + fromAmountCents(absAmountCents(tx.amount)));
    }

    for (const tx of previousTransactions) {
      if (tx.type !== "expense") continue;
      const day = dayOfMonth(tx.date);
      const current = previousDayTotals.get(day) ?? 0;
      previousDayTotals.set(day, current + fromAmountCents(absAmountCents(tx.amount)));
    }

    let runningCurrent = 0;
    let runningPrevious = 0;
    const spendingTrend: TrendPoint[] = Array.from({ length: maxDays }, (_, index) => {
      const day = index + 1;
      runningCurrent += currentDayTotals.get(day) ?? 0;
      runningPrevious += previousDayTotals.get(day) ?? 0;
      return {
        day,
        current: round2(runningCurrent),
        previous: round2(runningPrevious)
      };
    });

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
          color: category?.color ?? "#94a3b8",
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
    const netWorthDelta = round2(currentNetWorth - previousNetWorth);

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
        netWorth: currentNetWorth,
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
      netWorthDelta,
      netWorthSeries,
      spendingTrend,
      topCategories,
      cashflow
    };
  }
};

