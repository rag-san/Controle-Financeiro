import { format } from "date-fns";
import type { TransactionDTO } from "@/lib/types";
import type { ExpensesStackedRow } from "@/src/features/cashflow/types";

const OTHER_CATEGORY_KEY = "Other";

type BuildMonthlyExpensesStackOptions = {
  topN?: number;
};

type BuildMonthlyExpensesStackResult = {
  rows: ExpensesStackedRow[];
  categories: string[];
  legendCategories: string[];
  topN: number;
};

function monthKey(dateValue: string): string {
  return format(new Date(dateValue), "yyyy-MM");
}

export function buildMonthlyExpensesStack(
  transactions: TransactionDTO[],
  { topN = 8 }: BuildMonthlyExpensesStackOptions = {}
): BuildMonthlyExpensesStackResult {
  const monthCategoryMap = new Map<string, Map<string, number>>();
  const categoryTotals = new Map<string, number>();

  const expenseTransactions = transactions.filter((transaction) => transaction.amount < 0);
  if (expenseTransactions.length === 0) {
    return {
      rows: [],
      categories: [],
      legendCategories: [],
      topN
    };
  }

  for (const transaction of transactions) {
    const month = monthKey(transaction.date);
    if (!monthCategoryMap.has(month)) {
      monthCategoryMap.set(month, new Map<string, number>());
    }
  }

  for (const transaction of expenseTransactions) {
    const month = monthKey(transaction.date);
    const category = transaction.category?.name?.trim() || "Sem categoria";
    const amount = Math.abs(transaction.amount);

    if (!monthCategoryMap.has(month)) {
      monthCategoryMap.set(month, new Map<string, number>());
    }

    const monthValues = monthCategoryMap.get(month);
    if (!monthValues) continue;

    monthValues.set(category, (monthValues.get(category) ?? 0) + amount);
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
  }

  const orderedCategories = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((left, right) => right.total - left.total);

  const topCategories = orderedCategories.slice(0, topN).map((item) => item.category);
  const hasOther = orderedCategories.length > topN;
  const categories = hasOther ? [...topCategories, OTHER_CATEGORY_KEY] : topCategories;
  const legendCategories = hasOther
    ? [...topCategories.slice(0, 5), OTHER_CATEGORY_KEY]
    : topCategories.slice(0, 5);

  const rows: ExpensesStackedRow[] = [...monthCategoryMap.entries()]
    .sort(([leftMonth], [rightMonth]) => (leftMonth > rightMonth ? 1 : -1))
    .map(([month, categoryValues]) => {
      const row: ExpensesStackedRow = {
        month,
        total: 0
      };

      for (const category of categories) {
        row[category] = 0;
      }

      for (const [category, value] of categoryValues.entries()) {
        if (topCategories.includes(category)) {
          row[category] = Number((Number(row[category]) + value).toFixed(2));
        } else if (hasOther) {
          row[OTHER_CATEGORY_KEY] = Number((Number(row[OTHER_CATEGORY_KEY]) + value).toFixed(2));
        }
      }

      row.total = Number(
        categories.reduce((sum, category) => sum + Number(row[category] ?? 0), 0).toFixed(2)
      );

      return row;
    });

  return {
    rows,
    categories,
    legendCategories,
    topN
  };
}
