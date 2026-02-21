import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { getCategoryColor } from "@/src/features/categories/categoryColors";

export type MonthInterval = {
  start: Date;
  end: Date;
};

export type CategorySpendItem = {
  categoryId: string | null;
  name: string;
  parentId: string | null;
  color: string;
  value: number;
  share: number;
};

export type CategoryDonutSlice = {
  id: string;
  label: string;
  color: string;
  value: number;
  percentage: number;
};

export type CategoryGroupAggregate = {
  id: string;
  name: string;
  color: string;
  total: number;
  children: CategorySpendItem[];
};

export type CategoryMonthAggregates = {
  totalSpent: number;
  list: CategorySpendItem[];
  donut: CategoryDonutSlice[];
  groups: CategoryGroupAggregate[];
  monthInterval: MonthInterval;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function inRange(date: Date, interval: MonthInterval): boolean {
  const time = date.getTime();
  return time >= interval.start.getTime() && time <= interval.end.getTime();
}

function buildCategoryIndex(categories: CategoryDTO[]): Map<string, CategoryDTO> {
  return new Map(categories.map((category) => [category.id, category]));
}

function buildCategoryTotals(
  transactions: TransactionDTO[],
  categoriesById: Map<string, CategoryDTO>,
  monthInterval: MonthInterval
): Map<string, CategorySpendItem> {
  const totals = new Map<string, CategorySpendItem>();

  for (const transaction of transactions) {
    const date = new Date(transaction.date);
    if (Number.isNaN(date.getTime()) || !inRange(date, monthInterval)) {
      continue;
    }

    if (transaction.type !== "expense") {
      continue;
    }

    const amount = Math.abs(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const fallbackCategory = transaction.categoryId
      ? categoriesById.get(transaction.categoryId)
      : transaction.category ?? null;
    const categoryId = transaction.categoryId ?? null;
    const bucketId = categoryId ?? "__uncategorized";
    const name = fallbackCategory?.name ?? "Sem categoria";
    const parentId = fallbackCategory?.parentId ?? null;
    const color = fallbackCategory?.color ?? getCategoryColor(name);

    const current = totals.get(bucketId) ?? {
      categoryId,
      name,
      parentId,
      color,
      value: 0,
      share: 0
    };
    current.value += amount;
    totals.set(bucketId, current);
  }

  return totals;
}

function buildDonutSlices(items: CategorySpendItem[], totalSpent: number, topN = 5): CategoryDonutSlice[] {
  if (totalSpent <= 0 || items.length === 0) {
    return [];
  }

  const topItems = items.slice(0, topN);
  const otherValue = items.slice(topN).reduce((sum, item) => sum + item.value, 0);

  const slices = topItems.map((item) => ({
    id: item.categoryId ?? `uncategorized-${item.name}`,
    label: item.name,
    color: item.color,
    value: round2(item.value),
    percentage: Number(((item.value / totalSpent) * 100).toFixed(2))
  }));

  if (otherValue > 0) {
    slices.push({
      id: "other",
      label: "Outros",
      color: "#94a3b8",
      value: round2(otherValue),
      percentage: Number(((otherValue / totalSpent) * 100).toFixed(2))
    });
  }

  return slices;
}

function buildGroups(
  categories: CategoryDTO[],
  categoryTotals: Map<string, CategorySpendItem>,
  totalSpent: number
): CategoryGroupAggregate[] {
  const roots = categories.filter((category) => !category.parentId);
  const childrenByParent = new Map<string, CategoryDTO[]>();

  for (const category of categories) {
    if (!category.parentId) continue;
    const bucket = childrenByParent.get(category.parentId) ?? [];
    bucket.push(category);
    childrenByParent.set(category.parentId, bucket);
  }

  const groups: CategoryGroupAggregate[] = [];
  const usedCategoryIds = new Set<string>();

  for (const root of roots) {
    const children = childrenByParent.get(root.id) ?? [];
    const members = children.length > 0 ? children : [root];
    const groupItems = members.map((member) => {
      const total = categoryTotals.get(member.id)?.value ?? 0;
      usedCategoryIds.add(member.id);
      return {
        categoryId: member.id,
        name: member.name,
        parentId: member.parentId ?? root.id,
        color: member.color || getCategoryColor(member.name),
        value: round2(total),
        share: totalSpent > 0 ? Number(((total / totalSpent) * 100).toFixed(2)) : 0
      } satisfies CategorySpendItem;
    });

    const rootOwnTotal = categoryTotals.get(root.id)?.value ?? 0;
    if (rootOwnTotal > 0 && children.length > 0) {
      groupItems.push({
        categoryId: root.id,
        name: root.name,
        parentId: root.id,
        color: root.color || getCategoryColor(root.name),
        value: round2(rootOwnTotal),
        share: totalSpent > 0 ? Number(((rootOwnTotal / totalSpent) * 100).toFixed(2)) : 0
      });
      usedCategoryIds.add(root.id);
    }

    groups.push({
      id: root.id,
      name: root.name,
      color: root.color || getCategoryColor(root.name),
      total: round2(groupItems.reduce((sum, item) => sum + item.value, 0)),
      children: groupItems.sort((left, right) => right.value - left.value)
    });
  }

  const orphanItems: CategorySpendItem[] = [];
  for (const [key, total] of categoryTotals.entries()) {
    if (key === "__uncategorized") {
      orphanItems.push({
        ...total,
        share: totalSpent > 0 ? Number(((total.value / totalSpent) * 100).toFixed(2)) : 0
      });
      continue;
    }
    if (total.categoryId && usedCategoryIds.has(total.categoryId)) continue;
    orphanItems.push({
      ...total,
      share: totalSpent > 0 ? Number(((total.value / totalSpent) * 100).toFixed(2)) : 0
    });
  }

  if (orphanItems.length > 0) {
    groups.push({
      id: "other-group",
      name: "Outros",
      color: "#94a3b8",
      total: round2(orphanItems.reduce((sum, item) => sum + item.value, 0)),
      children: orphanItems.sort((left, right) => right.value - left.value)
    });
  }

  return groups.sort((left, right) => right.total - left.total);
}

export function resolveMonthInterval(referenceDate: Date): MonthInterval {
  return {
    start: startOfMonth(referenceDate),
    end: endOfMonth(referenceDate)
  };
}

export function shiftMonth(referenceDate: Date, delta: number): Date {
  return addMonths(referenceDate, delta);
}

export function buildCategoryMonthAggregates(
  categories: CategoryDTO[],
  transactions: TransactionDTO[],
  referenceDate: Date
): CategoryMonthAggregates {
  const monthInterval = resolveMonthInterval(referenceDate);
  const categoriesById = buildCategoryIndex(categories);
  const totalsMap = buildCategoryTotals(transactions, categoriesById, monthInterval);
  const list = [...totalsMap.values()]
    .map((item) => ({ ...item, value: round2(item.value) }))
    .sort((left, right) => right.value - left.value);

  const totalSpent = round2(list.reduce((sum, item) => sum + item.value, 0));

  const listWithShare = list.map((item) => ({
    ...item,
    share: totalSpent > 0 ? Number(((item.value / totalSpent) * 100).toFixed(2)) : 0
  }));

  return {
    totalSpent,
    list: listWithShare,
    donut: buildDonutSlices(listWithShare, totalSpent, 5),
    groups: buildGroups(categories, totalsMap, totalSpent),
    monthInterval
  };
}

export function buildTransactionsMonthQuery(interval: MonthInterval): string {
  const from = format(interval.start, "yyyy-MM-dd");
  const to = `${format(interval.end, "yyyy-MM-dd")}T23:59:59.999`;
  return `period=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&type=expense`;
}
