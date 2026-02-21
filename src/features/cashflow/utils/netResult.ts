import { eachMonthOfInterval, format } from "date-fns";
import type { TransactionDTO } from "@/lib/types";
import type { NetResultRow } from "@/src/features/cashflow/types";

type BuildMonthlyNetResultOptions = {
  start: Date;
  end: Date;
  previousStart?: Date;
  previousEnd?: Date;
  previousTransactions?: TransactionDTO[];
};

function toMonthKey(value: Date): string {
  return format(value, "yyyy-MM");
}

function buildMonthKeys(start: Date, end: Date): string[] {
  return eachMonthOfInterval({ start, end }).map(toMonthKey);
}

function buildMonthlyNetMap(
  transactions: TransactionDTO[],
  monthKeys: string[],
  start: Date,
  end: Date
): Map<string, number> {
  const netByMonth = new Map<string, number>(monthKeys.map((key) => [key, 0]));

  for (const transaction of transactions) {
    const txDate = new Date(transaction.date);
    if (txDate < start || txDate > end) continue;

    const monthKey = toMonthKey(txDate);
    if (!netByMonth.has(monthKey)) continue;

    const previous = netByMonth.get(monthKey) ?? 0;
    netByMonth.set(monthKey, previous + transaction.amount);
  }

  for (const [key, value] of netByMonth.entries()) {
    netByMonth.set(key, Number(value.toFixed(2)));
  }

  return netByMonth;
}

export function buildMonthlyNetResult(
  transactions: TransactionDTO[],
  { start, end, previousStart, previousEnd, previousTransactions }: BuildMonthlyNetResultOptions
): NetResultRow[] {
  const currentMonthKeys = buildMonthKeys(start, end);
  const currentNetByMonth = buildMonthlyNetMap(transactions, currentMonthKeys, start, end);

  let previousByIndex: number[] | null = null;

  if (previousTransactions && previousStart && previousEnd) {
    const previousMonthKeys = buildMonthKeys(previousStart, previousEnd);
    const previousNetByMonth = buildMonthlyNetMap(
      previousTransactions,
      previousMonthKeys,
      previousStart,
      previousEnd
    );

    previousByIndex = previousMonthKeys.map((monthKey) => previousNetByMonth.get(monthKey) ?? 0);
  }

  return currentMonthKeys.map((monthKey, index) => {
    const row: NetResultRow = {
      month: monthKey,
      net: currentNetByMonth.get(monthKey) ?? 0
    };

    if (previousByIndex && index < previousByIndex.length) {
      row.previousNet = previousByIndex[index];
    }

    return row;
  });
}
