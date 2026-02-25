import { addMonths, endOfMonth, isValid } from "date-fns";
import { hasInstallmentMarker } from "@/lib/installments";
import type {
  ReportPreparedTransaction,
  ReportsPeriodRange,
  ReportsRecurringDetected
} from "@/src/features/reports/types";

type MerchantRecurringGroup = {
  merchantKey: string;
  merchantLabel: string;
  transactions: ReportPreparedTransaction[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function estimateNextExpectedDate(latestDate: Date): Date | null {
  if (!isValid(latestDate)) return null;

  const next = addMonths(latestDate, 1);
  const monthEnd = endOfMonth(next).getDate();
  const day = Math.min(latestDate.getDate(), monthEnd);
  return new Date(next.getFullYear(), next.getMonth(), day);
}

function appearsRecurring(transactions: ReportPreparedTransaction[]): boolean {
  if (transactions.length < 2) return false;

  const monthSet = new Set(transactions.map((item) => `${item.date.getFullYear()}-${item.date.getMonth()}`));
  if (monthSet.size < 2) return false;

  const amounts = transactions.map((item) => item.absAmount);
  const med = median(amounts);
  if (med <= 0) return false;

  const dayMedian = median(transactions.map((item) => item.date.getDate()));
  const amountTolerance = med * 0.12;

  const consistentCount = transactions.filter((item) => {
    const amountOk = Math.abs(item.absAmount - med) <= amountTolerance;
    const dayOk = Math.abs(item.date.getDate() - dayMedian) <= 3;
    return amountOk && dayOk;
  }).length;

  return consistentCount >= 2;
}

export function detectRecurringMerchants(
  transactions: ReportPreparedTransaction[],
  currentPeriod: ReportsPeriodRange,
  limit = 5
): ReportsRecurringDetected[] {
  const groups = new Map<string, MerchantRecurringGroup>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    if (hasInstallmentMarker(transaction.description)) continue;
    if (transaction.timestamp > currentPeriod.end.getTime()) continue;

    const current = groups.get(transaction.merchantKey) ?? {
      merchantKey: transaction.merchantKey,
      merchantLabel: transaction.description,
      transactions: []
    };
    current.transactions.push(transaction);
    groups.set(transaction.merchantKey, current);
  }

  const detected: ReportsRecurringDetected[] = [];

  for (const group of groups.values()) {
    if (!appearsRecurring(group.transactions)) continue;

    const sortedTransactions = [...group.transactions].sort(
      (left, right) => left.timestamp - right.timestamp
    );
    const latest = sortedTransactions[sortedTransactions.length - 1];
    const estimatedCost = round2(median(sortedTransactions.map((item) => item.absAmount)));

    detected.push({
      merchantKey: group.merchantKey,
      merchantLabel: group.merchantLabel,
      estimatedMonthlyCost: estimatedCost,
      nextExpectedDate: estimateNextExpectedDate(latest.date),
      occurrences: sortedTransactions.length
    });
  }

  return detected
    .sort((left, right) => right.estimatedMonthlyCost - left.estimatedMonthlyCost)
    .slice(0, limit);
}

