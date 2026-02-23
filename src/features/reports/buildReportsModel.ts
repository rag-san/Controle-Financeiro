import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { dateKeyToNoonDate, isDateInRangeByKey, toDateKey } from "@/lib/finance/date-keys";
import { absAmountCents, fromAmountCents } from "@/lib/finance/official-metrics";
import { getCategoryColor } from "@/src/features/categories/categoryColors";
import type {
  ReportPreparedTransaction,
  ReportsCategorySpend,
  ReportsMerchantSpend,
  ReportsModel,
  ReportsPeriodComparison,
  ReportsTotals
} from "@/src/features/reports/types";
import { buildSankeyModel } from "@/src/features/reports/sankey/buildSankeyModel";
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
  valueCents: number;
  color: string;
  icon: string | null;
};

type MerchantAccumulator = {
  merchantKey: string;
  merchantLabel: string;
  totalCents: number;
  count: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveCategoryData(
  transaction: TransactionDTO,
  categoriesById: Map<string, CategoryDTO>
): {
  id: string | null;
  name: string;
  color: string;
  icon: string | null;
  parentId: string | null;
  parentName: string | null;
} {
  const category =
    (transaction.categoryId ? categoriesById.get(transaction.categoryId) : null) ??
    transaction.category ??
    null;

  const name = category?.name?.trim() || "Sem categoria";
  const parentId = category?.parentId ?? null;
  const parentName = parentId ? categoriesById.get(parentId)?.name?.trim() ?? null : null;
  return {
    id: category?.id ?? transaction.categoryId ?? null,
    name,
    color: category?.color || getCategoryColor(name),
    icon: category?.icon ?? null,
    parentId,
    parentName
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

type ReportsTotalsCents = {
  incomeCents: number;
  expenseCents: number;
};

function createEmptyTotals(): ReportsTotalsCents {
  return { incomeCents: 0, expenseCents: 0 };
}

function finalizeTotals(totals: ReportsTotalsCents): ReportsTotals {
  const income = fromAmountCents(totals.incomeCents);
  const expense = fromAmountCents(totals.expenseCents);
  return {
    income: round2(income),
    expense: round2(expense),
    net: round2(income - expense)
  };
}

export function buildReportsModel(input: BuildReportsModelInput): ReportsModel {
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));

  const prepared: ReportPreparedTransaction[] = [];
  const currentPeriodTransactions: ReportPreparedTransaction[] = [];
  const currentTotals = createEmptyTotals();
  const previousTotals = createEmptyTotals();
  const categoryById = new Map<string, CategoryAccumulator>();
  const merchantByKey = new Map<string, MerchantAccumulator>();

  for (const transaction of input.transactions) {
    if (input.accountId && transaction.accountId !== input.accountId) continue;
    if (input.categoryId && (transaction.categoryId ?? "") !== input.categoryId) continue;

    const dateKey = toDateKey(transaction.date);
    if (!dateKey) continue;
    const date = dateKeyToNoonDate(dateKey);
    if (!date) continue;
    const timestamp = date.getTime();

    const absCents = absAmountCents(transaction.amount);
    if (absCents <= 0) continue;
    const absAmount = fromAmountCents(absCents);

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
      accountName: transaction.account?.name?.trim() || "Conta",
      categoryId: category.id,
      parentCategoryId: category.parentId,
      parentCategoryName: category.parentName,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
      merchantKey
    };
    prepared.push(preparedTx);

    const inCurrent = isDateInRangeByKey(dateKey, input.period.current.start, input.period.current.end);
    const inPrevious = isDateInRangeByKey(dateKey, input.period.previous.start, input.period.previous.end);

    if (inCurrent) {
      currentPeriodTransactions.push(preparedTx);

      if (preparedTx.type === "income") {
        currentTotals.incomeCents += absCents;
      } else if (preparedTx.type === "expense") {
        currentTotals.expenseCents += absCents;

        const categoryKey = preparedTx.categoryId ?? "__uncategorized";
        const categoryCurrent = categoryById.get(categoryKey) ?? {
          categoryId: preparedTx.categoryId,
          name: preparedTx.categoryName,
          valueCents: 0,
          color: preparedTx.categoryColor,
          icon: preparedTx.categoryIcon
        };
        categoryCurrent.valueCents += absCents;
        categoryById.set(categoryKey, categoryCurrent);

        const merchantCurrent = merchantByKey.get(merchantKey) ?? {
          merchantKey,
          merchantLabel: toMerchantLabel(preparedTx.description, merchantKey),
          totalCents: 0,
          count: 0
        };
        merchantCurrent.totalCents += absCents;
        merchantCurrent.count += 1;
        merchantByKey.set(merchantKey, merchantCurrent);
      }
    }

    if (inPrevious) {
      if (preparedTx.type === "income") {
        previousTotals.incomeCents += absCents;
      } else if (preparedTx.type === "expense") {
        previousTotals.expenseCents += absCents;
      }
    }
  }

  const finalizedCurrentTotals = finalizeTotals(currentTotals);
  const finalizedPreviousTotals = finalizeTotals(previousTotals);
  const expenseTotal = Math.max(0, finalizedCurrentTotals.expense);

  const categorySpending: ReportsCategorySpend[] = [...categoryById.values()]
    .sort((left, right) => right.valueCents - left.valueCents)
    .map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      value: round2(fromAmountCents(item.valueCents)),
      share: expenseTotal > 0 ? round2((fromAmountCents(item.valueCents) / expenseTotal) * 100) : 0,
      color: item.color,
      icon: item.icon
    }));

  const topMerchants: ReportsMerchantSpend[] = [...merchantByKey.values()]
    .sort((left, right) => right.totalCents - left.totalCents)
    .slice(0, 10)
    .map((item) => ({
      merchantKey: item.merchantKey,
      merchantLabel: item.merchantLabel,
      total: round2(fromAmountCents(item.totalCents)),
      count: item.count
    }));

  const timeSeries = buildIncomeExpenseSeries(prepared, input.period.current);
  const recurringDetected = detectRecurringMerchants(prepared, input.period.current, 5);
  const sankey = buildSankeyModel(currentPeriodTransactions, {
    topCategories: 7,
    topSubcategoriesPerCategory: 2
  });
  const hasCurrentData = finalizedCurrentTotals.income > 0 || finalizedCurrentTotals.expense > 0;

  return {
    currentTotals: finalizedCurrentTotals,
    previousTotals: finalizedPreviousTotals,
    categorySpending,
    topMerchants,
    recurringDetected,
    timeSeries,
    sankey,
    hasCurrentData
  };
}

