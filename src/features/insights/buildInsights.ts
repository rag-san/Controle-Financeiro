import { format } from "date-fns";
import { dateKeyToNoonDate, toDateKey } from "@/lib/finance/date-keys";
import type { CategoryDTO } from "@/lib/types";
import { detectAnomalies } from "@/src/features/insights/detectors/anomalies";
import { detectBiggestIncrease } from "@/src/features/insights/detectors/biggestIncrease";
import { detectDuplicates } from "@/src/features/insights/detectors/duplicates";
import { detectSpendPace } from "@/src/features/insights/detectors/spendPace";
import { detectSubscriptions } from "@/src/features/insights/detectors/subscriptions";
import { detectTopCategory } from "@/src/features/insights/detectors/topCategory";
import { detectUncategorized } from "@/src/features/insights/detectors/uncategorized";
import type {
  CategoryAggregate,
  Insight,
  InsightsBuildInput,
  InsightsDetectorContext,
  PreparedTransaction
} from "@/src/features/insights/types";
import { extractMerchantKey } from "@/src/features/insights/utils/merchant";

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeCategoryName(categoryName: string | null | undefined): string {
  const trimmed = categoryName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Sem categoria";
}

function toPreparedTransactions(
  transactions: InsightsBuildInput["transactions"],
  categoryById: Map<string, CategoryDTO>
): PreparedTransaction[] {
  return transactions
    .map<PreparedTransaction | null>((transaction) => {
      if (transaction.type === "transfer") {
        return null;
      }

      const dateKey = toDateKey(transaction.date);
      if (!dateKey) {
        return null;
      }

      const date = dateKeyToNoonDate(dateKey);
      if (!date) {
        return null;
      }

      const amount = Number.isFinite(transaction.amount) ? transaction.amount : 0;
      const categoryNameFromMap = transaction.categoryId
        ? categoryById.get(transaction.categoryId)?.name
        : undefined;
      const categoryName = normalizeCategoryName(transaction.category?.name ?? categoryNameFromMap);

      return {
        transaction,
        id: transaction.id,
        date,
        timestamp: date.getTime(),
        dayOfMonth: date.getDate(),
        monthKey: format(date, "yyyy-MM"),
        amount: round2(amount),
        absAmount: round2(Math.abs(amount)),
        type: transaction.type,
        categoryId: transaction.categoryId ?? null,
        categoryName,
        merchantKey: extractMerchantKey(transaction)
      };
    })
    .filter((item): item is PreparedTransaction => item !== null);
}

function inRange(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function aggregateCategories(transactions: PreparedTransaction[]): Map<string, CategoryAggregate> {
  const map = new Map<string, CategoryAggregate>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    const key = transaction.categoryId ?? "__uncategorized";
    const current = map.get(key) ?? {
      categoryId: transaction.categoryId,
      categoryName: transaction.categoryName,
      total: 0,
      count: 0
    };
    current.total = round2(current.total + transaction.absAmount);
    current.count += 1;
    map.set(key, current);
  }

  return map;
}

function aggregateMerchants(transactions: PreparedTransaction[]): Map<string, { merchantKey: string; total: number; count: number }> {
  const map = new Map<string, { merchantKey: string; total: number; count: number }>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    const current = map.get(transaction.merchantKey) ?? {
      merchantKey: transaction.merchantKey,
      total: 0,
      count: 0
    };
    current.total = round2(current.total + transaction.absAmount);
    current.count += 1;
    map.set(transaction.merchantKey, current);
  }

  return map;
}

function sortInsights(insights: Insight[]): Insight[] {
  return [...insights].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === "warning" ? -1 : 1;
    }

    const leftImpact = left.impact ?? 0;
    const rightImpact = right.impact ?? 0;
    return rightImpact - leftImpact;
  });
}

export function buildInsights(input: InsightsBuildInput): Insight[] {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const prepared = toPreparedTransactions(input.transactions, categoryById);
  const currentTransactions = prepared.filter((transaction) =>
    inRange(transaction.date, input.period.currentPeriod.start, input.period.currentPeriod.end)
  );
  const previousTransactions = prepared.filter((transaction) =>
    inRange(transaction.date, input.period.previousPeriod.start, input.period.previousPeriod.end)
  );
  const currentExpenses = currentTransactions.filter((transaction) => transaction.type === "expense");
  const previousExpenses = previousTransactions.filter((transaction) => transaction.type === "expense");

  const context: InsightsDetectorContext = {
    categories: input.categories,
    categoryById,
    prepared,
    currentTransactions,
    previousTransactions,
    currentExpenses,
    previousExpenses,
    categoryTotalsCurrent: aggregateCategories(currentTransactions),
    categoryTotalsPrevious: aggregateCategories(previousTransactions),
    merchantTotalsCurrent: aggregateMerchants(currentTransactions),
    merchantTotalsPrevious: aggregateMerchants(previousTransactions),
    period: input.period,
    today: input.today ?? new Date()
  };

  const insights = [
    detectTopCategory(context),
    detectBiggestIncrease(context),
    detectSpendPace(context),
    detectSubscriptions(context),
    detectDuplicates(context),
    detectAnomalies(context),
    detectUncategorized(context)
  ].filter((insight): insight is Insight => insight !== null);

  return sortInsights(insights);
}
