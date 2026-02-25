import { endOfMonth, isSameMonth, subMonths } from "date-fns";
import { absAmountCents, fromAmountCents } from "@/lib/finance/official-metrics";

export type SpendingTrendPoint = {
  day: number;
  current: number;
  previous: number;
};

type ExpenseTransactionLike = {
  date: Date;
  amount: number;
  type: string;
};

export type SpendingTrendSeries = {
  compareUntilDay: number;
  daily: SpendingTrendPoint[];
  accumulated: SpendingTrendPoint[];
  totals: {
    current: number;
    previous: number;
  };
};

type BuildSpendingTrendSeriesInput = {
  currentTransactions: ExpenseTransactionLike[];
  previousTransactions: ExpenseTransactionLike[];
  referenceDate: Date;
  now: Date;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function dayOfMonth(date: Date): number {
  return date.getUTCDate();
}

function buildExpenseDailyTotals(
  transactions: ExpenseTransactionLike[],
  compareUntilDay: number
): Map<number, number> {
  const totals = new Map<number, number>();

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const day = dayOfMonth(tx.date);
    if (day < 1 || day > compareUntilDay) continue;
    const amount = fromAmountCents(absAmountCents(tx.amount));
    totals.set(day, (totals.get(day) ?? 0) + amount);
  }

  return totals;
}

function resolveCompareUntilDay(input: { referenceDate: Date; now: Date }): number {
  const currentMonthDays = endOfMonth(input.referenceDate).getDate();
  const previousMonthDays = endOfMonth(subMonths(input.referenceDate, 1)).getDate();
  const isCurrentMonthReference = isSameMonth(input.referenceDate, input.now);
  const currentMonthCutoff = isCurrentMonthReference ? Math.min(input.now.getDate(), currentMonthDays) : currentMonthDays;

  return Math.max(1, Math.min(currentMonthCutoff, currentMonthDays, previousMonthDays));
}

export function buildSpendingTrendSeries(input: BuildSpendingTrendSeriesInput): SpendingTrendSeries {
  const compareUntilDay = resolveCompareUntilDay({
    referenceDate: input.referenceDate,
    now: input.now
  });

  const currentDailyTotals = buildExpenseDailyTotals(input.currentTransactions, compareUntilDay);
  const previousDailyTotals = buildExpenseDailyTotals(input.previousTransactions, compareUntilDay);

  let runningCurrent = 0;
  let runningPrevious = 0;

  const daily: SpendingTrendPoint[] = [];
  const accumulated: SpendingTrendPoint[] = [];

  for (let day = 1; day <= compareUntilDay; day += 1) {
    const currentDayValue = round2(currentDailyTotals.get(day) ?? 0);
    const previousDayValue = round2(previousDailyTotals.get(day) ?? 0);

    daily.push({
      day,
      current: currentDayValue,
      previous: previousDayValue
    });

    runningCurrent += currentDayValue;
    runningPrevious += previousDayValue;

    accumulated.push({
      day,
      current: round2(runningCurrent),
      previous: round2(runningPrevious)
    });
  }

  const totalsPoint = accumulated[accumulated.length - 1] ?? { current: 0, previous: 0 };

  return {
    compareUntilDay,
    daily,
    accumulated,
    totals: {
      current: totalsPoint.current,
      previous: totalsPoint.previous
    }
  };
}
