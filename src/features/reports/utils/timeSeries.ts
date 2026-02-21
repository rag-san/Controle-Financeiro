import { format, startOfMonth, startOfWeek } from "date-fns";
import type { ReportPreparedTransaction, ReportsPeriodRange, ReportsTimeSeriesPoint } from "@/src/features/reports/types";

type SeriesBucket = {
  key: string;
  from: Date;
  to: Date;
  income: number;
  expense: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function inRange(timestamp: number, range: ReportsPeriodRange): boolean {
  return timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
}

function resolveGranularity(range: ReportsPeriodRange): "week" | "month" {
  const durationDays = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)));
  return durationDays <= 70 ? "week" : "month";
}

export function buildIncomeExpenseSeries(
  transactions: ReportPreparedTransaction[],
  range: ReportsPeriodRange
): ReportsTimeSeriesPoint[] {
  const granularity = resolveGranularity(range);
  const bucketsByKey = new Map<string, SeriesBucket>();

  for (const transaction of transactions) {
    if (!inRange(transaction.timestamp, range)) continue;

    const bucketStart =
      granularity === "week"
        ? startOfWeek(transaction.date, { weekStartsOn: 1 })
        : startOfMonth(transaction.date);
    const bucketKey = format(bucketStart, granularity === "week" ? "yyyy-'W'II" : "yyyy-MM");
    const bucket = bucketsByKey.get(bucketKey) ?? {
      key: bucketKey,
      from: bucketStart,
      to: bucketStart,
      income: 0,
      expense: 0
    };

    if (transaction.type === "income") {
      bucket.income = round2(bucket.income + transaction.absAmount);
    } else {
      bucket.expense = round2(bucket.expense + transaction.absAmount);
    }

    if (transaction.date > bucket.to) {
      bucket.to = transaction.date;
    }

    bucketsByKey.set(bucketKey, bucket);
  }

  return [...bucketsByKey.values()]
    .sort((left, right) => left.from.getTime() - right.from.getTime())
    .map((bucket) => ({
      key: bucket.key,
      label: granularity === "week" ? format(bucket.from, "dd/MM") : format(bucket.from, "MMM/yy"),
      from: bucket.from,
      to: bucket.to,
      income: round2(bucket.income),
      expense: round2(bucket.expense),
      net: round2(bucket.income - bucket.expense)
    }));
}

