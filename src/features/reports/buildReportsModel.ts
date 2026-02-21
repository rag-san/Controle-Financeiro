import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { getCategoryColor } from "@/src/features/categories/categoryColors";
import type {
  ReportPreparedTransaction,
  ReportsCategorySpend,
  ReportsMerchantSpend,
  ReportsModel,
  ReportsPeriodComparison,
  ReportsTotals
} from "@/src/features/reports/types";
import { detectRecurringMerchants } from "@/src/features/reports/utils/recurringDetection";
import { buildIncomeExpenseSeries } from "@/src/features/reports/utils/timeSeries";
import { extractMerchantKey } from "@/src/features/insights/utils/merchant";

type BuildReportsModelInput = {
  transactions: TransactionDTO[];
  categories: CategoryDTO[];
  period: ReportsPeriodComparison;
  accountId?: string;
  categoryId?: string;
};

type CategoryAccumulator = {
  categoryId: string | null;
  name: string;
  value: number;
  color: string;
  icon: string | null;
};

type MerchantAccumulator = {
  merchantKey: string;
  merchantLabel: string;
  total: number;
  count: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function inRange(timestamp: number, start: Date, end: Date): boolean {
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function resolveCategoryData(
  transaction: TransactionDTO,
  categoriesById: Map<string, CategoryDTO>
): { id: string | null; name: string; color: string; icon: string | null } {
  const category =
    (transaction.categoryId ? categoriesById.get(transaction.categoryId) : null) ??
    transaction.category ??
    null;

  const name = category?.name?.trim() || "Sem categoria";
  return {
    id: category?.id ?? transaction.categoryId ?? null,
    name,
    color: category?.color || getCategoryColor(name),
    icon: category?.icon ?? null
  };
}

function toMerchantLabel(description: string, merchantKey: string): string {
  const trimmed = description.trim();
  if (trimmed.length > 0) return trimmed;

  return merchantKey
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function createEmptyTotals(): ReportsTotals {
  return { income: 0, expense: 0, net: 0 };
}

function finalizeTotals(totals: ReportsTotals): ReportsTotals {
  const income = round2(totals.income);
  const expense = round2(totals.expense);
  return {
    income,
    expense,
    net: round2(income - expense)
  };
}

export function buildReportsModel(input: BuildReportsModelInput): ReportsModel {
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));

  const prepared: ReportPreparedTransaction[] = [];
  const currentTotals = createEmptyTotals();
  const previousTotals = createEmptyTotals();
  const categoryById = new Map<string, CategoryAccumulator>();
  const merchantByKey = new Map<string, MerchantAccumulator>();

  for (const transaction of input.transactions) {
    if (input.accountId && transaction.accountId !== input.accountId) continue;
    if (input.categoryId && (transaction.categoryId ?? "") !== input.categoryId) continue;

    const date = new Date(transaction.date);
    const timestamp = date.getTime();
    if (!Number.isFinite(timestamp)) continue;

    const absAmount = round2(Math.abs(transaction.amount));
    if (!Number.isFinite(absAmount) || absAmount <= 0) continue;

    const category = resolveCategoryData(transaction, categoriesById);
    const merchantKey = extractMerchantKey(transaction);

    const preparedTx: ReportPreparedTransaction = {
      id: transaction.id,
      date,
      timestamp,
      amount: round2(transaction.amount),
      absAmount,
      type: transaction.type,
      description: transaction.description,
      accountId: transaction.accountId,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
      merchantKey
    };
    prepared.push(preparedTx);

    const inCurrent = inRange(timestamp, input.period.current.start, input.period.current.end);
    const inPrevious = inRange(timestamp, input.period.previous.start, input.period.previous.end);

    if (inCurrent) {
      if (preparedTx.type === "income") {
        currentTotals.income = round2(currentTotals.income + absAmount);
      } else {
        currentTotals.expense = round2(currentTotals.expense + absAmount);

        const categoryKey = preparedTx.categoryId ?? "__uncategorized";
        const categoryCurrent = categoryById.get(categoryKey) ?? {
          categoryId: preparedTx.categoryId,
          name: preparedTx.categoryName,
          value: 0,
          color: preparedTx.categoryColor,
          icon: preparedTx.categoryIcon
        };
        categoryCurrent.value = round2(categoryCurrent.value + absAmount);
        categoryById.set(categoryKey, categoryCurrent);

        const merchantCurrent = merchantByKey.get(merchantKey) ?? {
          merchantKey,
          merchantLabel: toMerchantLabel(preparedTx.description, merchantKey),
          total: 0,
          count: 0
        };
        merchantCurrent.total = round2(merchantCurrent.total + absAmount);
        merchantCurrent.count += 1;
        merchantByKey.set(merchantKey, merchantCurrent);
      }
    }

    if (inPrevious) {
      if (preparedTx.type === "income") {
        previousTotals.income = round2(previousTotals.income + absAmount);
      } else {
        previousTotals.expense = round2(previousTotals.expense + absAmount);
      }
    }
  }

  const finalizedCurrentTotals = finalizeTotals(currentTotals);
  const finalizedPreviousTotals = finalizeTotals(previousTotals);
  const expenseTotal = Math.max(0, finalizedCurrentTotals.expense);

  const categorySpending: ReportsCategorySpend[] = [...categoryById.values()]
    .sort((left, right) => right.value - left.value)
    .map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      value: round2(item.value),
      share: expenseTotal > 0 ? round2((item.value / expenseTotal) * 100) : 0,
      color: item.color,
      icon: item.icon
    }));

  const topMerchants: ReportsMerchantSpend[] = [...merchantByKey.values()]
    .sort((left, right) => right.total - left.total)
    .slice(0, 10)
    .map((item) => ({
      merchantKey: item.merchantKey,
      merchantLabel: item.merchantLabel,
      total: round2(item.total),
      count: item.count
    }));

  const timeSeries = buildIncomeExpenseSeries(prepared, input.period.current);
  const recurringDetected = detectRecurringMerchants(prepared, input.period.current, 5);
  const hasCurrentData = finalizedCurrentTotals.income > 0 || finalizedCurrentTotals.expense > 0;

  return {
    currentTotals: finalizedCurrentTotals,
    previousTotals: finalizedPreviousTotals,
    categorySpending,
    topMerchants,
    recurringDetected,
    timeSeries,
    hasCurrentData
  };
}

