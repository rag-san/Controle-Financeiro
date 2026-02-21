import {
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths
} from "date-fns";
import type { TransactionDTO } from "@/lib/types";
import {
  formatDateRange,
  formatMonthYearLabel
} from "@/src/utils/format";
import type {
  CashflowPeriodKey,
  CashflowPeriodOption,
  ComparisonMetric,
  DateRange,
  IncomeRow,
  MonthlyAggregate
} from "@/src/features/cashflow/types";

export const CASHFLOW_PERIOD_OPTIONS: CashflowPeriodOption[] = [
  { value: "1m", label: "Último 1 mês" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "ytd", label: "YTD" },
  { value: "12m", label: "Últimos 12 meses" }
];

export function resolveCurrentRange(period: CashflowPeriodKey, referenceDate: Date): DateRange {
  const endDate = endOfDay(referenceDate);

  if (period === "ytd") {
    return {
      from: startOfYear(referenceDate),
      to: endDate
    };
  }

  if (period === "1m") {
    return {
      from: startOfMonth(referenceDate),
      to: endDate
    };
  }

  if (period === "3m") {
    return {
      from: startOfMonth(subMonths(referenceDate, 2)),
      to: endDate
    };
  }

  if (period === "6m") {
    return {
      from: startOfMonth(subMonths(referenceDate, 5)),
      to: endDate
    };
  }

  return {
    from: startOfMonth(subMonths(referenceDate, 11)),
    to: endDate
  };
}

export function resolvePreviousRange(currentRange: DateRange): DateRange {
  const totalDays = differenceInCalendarDays(currentRange.to, currentRange.from) + 1;
  const previousTo = endOfDay(subDays(currentRange.from, 1));
  const previousFrom = startOfDay(subDays(previousTo, totalDays - 1));
  return { from: previousFrom, to: previousTo };
}

function isDateWithinRange(date: Date, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function splitByRange(transactions: TransactionDTO[], range: DateRange): TransactionDTO[] {
  return transactions.filter((transaction) => {
    const txDate = new Date(transaction.date);
    return isDateWithinRange(txDate, range);
  });
}

export function calculateTotals(transactions: TransactionDTO[]): {
  income: number;
  expense: number;
  net: number;
} {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    if (transaction.amount >= 0) {
      income += transaction.amount;
    } else {
      expense += Math.abs(transaction.amount);
    }
  }

  return {
    income: Number(income.toFixed(2)),
    expense: Number(expense.toFixed(2)),
    net: Number((income - expense).toFixed(2))
  };
}

export function toComparisonMetric(current: number, previous: number): ComparisonMetric {
  let changePercent: number | null = null;

  if (previous !== 0) {
    changePercent = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
  }

  return {
    current: Number(current.toFixed(2)),
    previous: Number(previous.toFixed(2)),
    changePercent
  };
}

export function aggregateMonthly(
  transactions: TransactionDTO[],
  range: DateRange
): MonthlyAggregate[] {
  const baseMap = new Map<string, MonthlyAggregate>();
  const months = eachMonthOfInterval({ start: range.from, end: range.to });

  for (const monthDate of months) {
    const monthKey = format(monthDate, "yyyy-MM");
    baseMap.set(monthKey, {
      monthKey,
      monthLabel: formatMonthYearLabel(monthKey),
      income: 0,
      expense: 0,
      net: 0
    });
  }

  for (const transaction of transactions) {
    const txDate = new Date(transaction.date);
    const monthKey = format(txDate, "yyyy-MM");
    const current = baseMap.get(monthKey);
    if (!current) continue;

    if (transaction.amount >= 0) {
      current.income += transaction.amount;
    } else {
      current.expense += Math.abs(transaction.amount);
    }
  }

  return [...baseMap.values()].map((entry) => ({
    ...entry,
    income: Number(entry.income.toFixed(2)),
    expense: Number(entry.expense.toFixed(2)),
    net: Number((entry.income - entry.expense).toFixed(2))
  }));
}

export function toIncomeChartData(currentMonths: MonthlyAggregate[]): IncomeRow[] {
  return currentMonths.map((month) => ({
    month: month.monthKey,
    income: month.income
  }));
}

export function formatRange(range: DateRange): string {
  return formatDateRange(range.from, range.to);
}

export function toIsoDate(value: Date): string {
  return format(value, "yyyy-MM-dd");
}
