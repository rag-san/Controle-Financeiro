import { eachMonthOfInterval, format } from "date-fns";
import { isDateInRangeByKey, toMonthKey } from "@/lib/finance/date-keys";
import { absAmountCents, fromAmountCents } from "@/lib/finance/official-metrics";
import type { TransactionDTO } from "@/lib/types";
import type { IncomeRow } from "@/src/features/cashflow/types";

type BuildMonthlyIncomeOptions = {
  start: Date;
  end: Date;
};

export function buildMonthlyIncome(
  transactions: TransactionDTO[],
  { start, end }: BuildMonthlyIncomeOptions
): IncomeRow[] {
  const monthKeys = eachMonthOfInterval({ start, end }).map((value) => format(value, "yyyy-MM"));
  const incomeByMonth = new Map<string, number>(monthKeys.map((month) => [month, 0]));

  for (const transaction of transactions) {
    if (transaction.type !== "income") continue;

    if (!isDateInRangeByKey(transaction.date, start, end)) continue;

    const month = toMonthKey(transaction.date);
    if (!month) continue;
    if (!incomeByMonth.has(month)) continue;

    const previous = incomeByMonth.get(month) ?? 0;
    incomeByMonth.set(month, previous + absAmountCents(transaction.amount));
  }

  return monthKeys.map((month) => ({
    month,
    income: fromAmountCents(incomeByMonth.get(month) ?? 0)
  }));
}
