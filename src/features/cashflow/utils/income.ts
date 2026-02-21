import { eachMonthOfInterval, format } from "date-fns";
import type { TransactionDTO } from "@/lib/types";
import type { IncomeRow } from "@/src/features/cashflow/types";

type BuildMonthlyIncomeOptions = {
  start: Date;
  end: Date;
};

function toMonthKey(value: Date): string {
  return format(value, "yyyy-MM");
}

export function buildMonthlyIncome(
  transactions: TransactionDTO[],
  { start, end }: BuildMonthlyIncomeOptions
): IncomeRow[] {
  const monthKeys = eachMonthOfInterval({ start, end }).map(toMonthKey);
  const incomeByMonth = new Map<string, number>(monthKeys.map((month) => [month, 0]));

  for (const transaction of transactions) {
    if (transaction.amount <= 0) continue;

    const txDate = new Date(transaction.date);
    if (txDate < start || txDate > end) continue;

    const month = toMonthKey(txDate);
    if (!incomeByMonth.has(month)) continue;

    const previous = incomeByMonth.get(month) ?? 0;
    incomeByMonth.set(month, previous + transaction.amount);
  }

  return monthKeys.map((month) => ({
    month,
    income: Number((incomeByMonth.get(month) ?? 0).toFixed(2))
  }));
}
