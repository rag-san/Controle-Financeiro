import { eachMonthOfInterval, format } from "date-fns";
import { isDateInRangeByKey, toMonthKey } from "@/lib/finance/date-keys";
import { absAmountCents, fromAmountCents } from "@/lib/finance/official-metrics";
import type { TransactionDTO } from "@/lib/types";
import type { NetResultRow } from "@/src/features/cashflow/types";

type BuildMonthlyNetResultOptions = {
  start: Date;
  end: Date;
  previousStart?: Date;
  previousEnd?: Date;
  previousTransactions?: TransactionDTO[];
};

function buildMonthKeys(start: Date, end: Date): string[] {
  return eachMonthOfInterval({ start, end }).map((value) => format(value, "yyyy-MM"));
}

function buildMonthlyNetMap(
  transactions: TransactionDTO[],
  monthKeys: string[],
  start: Date,
  end: Date
): Map<string, number> {
  const netByMonth = new Map<string, number>(monthKeys.map((key) => [key, 0]));

  for (const transaction of transactions) {
    if (!isDateInRangeByKey(transaction.date, start, end)) continue;
    if (transaction.type !== "income" && transaction.type !== "expense") continue;

    const monthKey = toMonthKey(transaction.date);
    if (!monthKey) continue;
    if (!netByMonth.has(monthKey)) continue;

    const previous = netByMonth.get(monthKey) ?? 0;
    const signedAmountCents =
      transaction.type === "income" ? absAmountCents(transaction.amount) : -absAmountCents(transaction.amount);
    netByMonth.set(monthKey, previous + signedAmountCents);
  }

  for (const [key, value] of netByMonth.entries()) {
    netByMonth.set(key, fromAmountCents(value));
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
