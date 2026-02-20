import { endOfMonth, format, isSameMonth, startOfMonth, subMonths } from "date-fns";
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
  return format(date, "yyyy-MM");
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export const dashboardRepo = {
  summaryByRange(userId: string, from: Date, to: Date) {
    const txs = transactionsRepo.listByDateRange(userId, from, to, true);

    let incomeCents = 0;
    let expenseCents = 0;
    const byCategoryMap = new Map<string, { totalCents: number; name: string; color: string }>();

    const categories = categoriesRepo.listByUser(userId);
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    for (const tx of txs) {
      const cents = Math.round(tx.amount * 100);
      if (tx.amount >= 0) {
        incomeCents += cents;
      } else {
        const absCents = Math.abs(cents);
        expenseCents += absCents;

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
        income: incomeCents,
        expenses: expenseCents,
        net: incomeCents - expenseCents
      },
      byCategory
    };
  },

  fullDashboard(userId: string, now = new Date()) {
    const latestTransactionDate = transactionsRepo.latestPostedAt(userId);
    const referenceDate = latestTransactionDate ?? now;
    const currentMonthStart = startOfMonth(referenceDate);
    const currentMonthEnd = endOfMonth(referenceDate);
    const previousMonthStart = startOfMonth(subMonths(referenceDate, 1));
    const previousMonthEnd = endOfMonth(subMonths(referenceDate, 1));
    const sixMonthsAgo = startOfMonth(subMonths(referenceDate, 5));

    const currentTransactions = transactionsRepo.listByDateRange(userId, currentMonthStart, currentMonthEnd, true);
    const previousTransactions = transactionsRepo.listByDateRange(userId, previousMonthStart, previousMonthEnd, true);
    const monthlyTransactions = transactionsRepo.listByDateRange(userId, sixMonthsAgo, currentMonthEnd, false);

    const monthSummary = currentTransactions.reduce(
      (acc, tx) => {
        if (tx.amount >= 0) acc.income += tx.amount;
        else acc.expense += Math.abs(tx.amount);
        return acc;
      },
      { income: 0, expense: 0 }
    );

    const previousSummary = previousTransactions.reduce(
      (acc, tx) => {
        if (tx.amount >= 0) acc.income += tx.amount;
        else acc.expense += Math.abs(tx.amount);
        return acc;
      },
      { income: 0, expense: 0 }
    );

    const maxDays = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
    const currentDayTotals = new Map<number, number>();
    const previousDayTotals = new Map<number, number>();

    for (const tx of currentTransactions) {
      if (tx.amount >= 0) continue;
      const day = tx.date.getDate();
      currentDayTotals.set(day, (currentDayTotals.get(day) ?? 0) + Math.abs(tx.amount));
    }

    for (const tx of previousTransactions) {
      if (tx.amount >= 0) continue;
      const day = tx.date.getDate();
      previousDayTotals.set(day, (previousDayTotals.get(day) ?? 0) + Math.abs(tx.amount));
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

    const categories = categoriesRepo.listByUser(userId);
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    const currentByCategory = new Map<string, number>();
    const previousByCategory = new Map<string, number>();

    for (const tx of currentTransactions) {
      if (!tx.categoryId || tx.amount >= 0) continue;
      currentByCategory.set(tx.categoryId, (currentByCategory.get(tx.categoryId) ?? 0) + Math.abs(tx.amount));
    }

    for (const tx of previousTransactions) {
      if (!tx.categoryId || tx.amount >= 0) continue;
      previousByCategory.set(tx.categoryId, (previousByCategory.get(tx.categoryId) ?? 0) + Math.abs(tx.amount));
    }

    const topCategories: CategoryComparison[] = [...currentByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([categoryId, total]) => {
        const previous = previousByCategory.get(categoryId) ?? 0;
        const category = categoryById.get(categoryId);

        return {
          categoryId,
          name: category?.name ?? "Sem categoria",
          color: category?.color ?? "#94a3b8",
          current: round2(total),
          previous: round2(previous),
          variation: round2(safeVariation(total, previous))
        };
      });

    const monthlyAccumulator = monthlyTransactions.reduce<Record<string, { income: number; expense: number }>>(
      (acc, tx) => {
        const key = monthKey(tx.date);
        if (!acc[key]) {
          acc[key] = { income: 0, expense: 0 };
        }
        if (tx.amount >= 0) acc[key].income += tx.amount;
        else acc[key].expense += Math.abs(tx.amount);
        return acc;
      },
      {}
    );

    const cashflow = Object.entries(monthlyAccumulator)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([month, values]) => ({
        month,
        income: round2(values.income),
        expense: round2(values.expense),
        balance: round2(values.income - values.expense)
      }));

    const latestNetWorthDate = netWorthRepo.latestDate(userId);
    const netWorthByType = latestNetWorthDate ? netWorthRepo.sumByTypeAtDate(userId, latestNetWorthDate) : [];
    const assets = netWorthByType.find((entry) => entry.type === "asset")?.value ?? 0;
    const debts = netWorthByType.find((entry) => entry.type === "debt")?.value ?? 0;

    const currentResult = monthSummary.income - monthSummary.expense;
    const previousResult = previousSummary.income - previousSummary.expense;

    return {
      referenceMonth: monthKey(referenceDate),
      isCurrentMonthReference: isSameMonth(referenceDate, now),
      cards: {
        income: round2(monthSummary.income),
        expense: round2(monthSummary.expense),
        result: round2(currentResult),
        netWorth: round2(assets - debts),
        spendPaceDelta: round2(safeVariation(monthSummary.expense, previousSummary.expense)),
        resultDelta: round2(safeVariation(currentResult, previousResult))
      },
      spendingTrend,
      topCategories,
      cashflow
    };
  }
};

