import { fromAmountCents } from "@/lib/finance/official-metrics";
import { getCategoryColor } from "@/src/features/categories/categoryColors";
import type { ReportPreparedTransaction } from "@/src/features/reports/types";
import type { SankeyLink, SankeyModel, SankeyNode } from "@/src/features/reports/sankey/types";

type BuildSankeyModelOptions = {
  topCategories?: number;
  topSubcategoriesPerCategory?: number;
};

type CategoryEntry = {
  key: string;
  label: string;
  valueCents: number;
};

const INCOME_NODE_ID = "income";
const EXPENSES_NODE_ID = "expenses";
const SAVED_NODE_ID = "saved";
const OTHER_CATEGORIES_LABEL = "Outras categorias";
const OTHER_SUBCATEGORIES_LABEL = "Outros";
const OPERATIONAL_CATEGORY_PATTERNS = [
  /\btransfer/i,
  /\btransf/i,
  /\bpagamento de fatura\b/i,
  /\bfatura\b/i
];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toTopEntries(source: Map<string, number>, limit: number): CategoryEntry[] {
  const sorted = [...source.entries()]
    .map(([key, valueCents]) => ({ key, label: key, valueCents }))
    .filter((entry) => entry.valueCents > 0)
    .sort((left, right) => right.valueCents - left.valueCents);

  if (sorted.length <= limit) {
    return sorted;
  }

  const top = sorted.slice(0, limit);
  const othersCents = sorted.slice(limit).reduce((sum, entry) => sum + entry.valueCents, 0);
  if (othersCents > 0) {
    top.push({
      key: OTHER_CATEGORIES_LABEL,
      label: OTHER_CATEGORIES_LABEL,
      valueCents: othersCents
    });
  }

  return top;
}

function lightenHex(hexColor: string, amount = 0.3): string {
  const clean = hexColor.replace("#", "");
  if (clean.length !== 6) return hexColor;

  const numeric = Number.parseInt(clean, 16);
  if (!Number.isFinite(numeric)) return hexColor;

  const red = (numeric >> 16) & 0xff;
  const green = (numeric >> 8) & 0xff;
  const blue = numeric & 0xff;

  const lighten = (channel: number) => Math.min(255, Math.round(channel + (255 - channel) * amount));
  const hex = (channel: number) => channel.toString(16).padStart(2, "0");

  return `#${hex(lighten(red))}${hex(lighten(green))}${hex(lighten(blue))}`;
}

function isOperationalFlowCategory(label: string): boolean {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return OPERATIONAL_CATEGORY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildSankeyModel(
  transactions: ReportPreparedTransaction[],
  options: BuildSankeyModelOptions = {}
): SankeyModel {
  const topCategoriesLimit = options.topCategories ?? 10;
  const topSubcategoriesLimit = options.topSubcategoriesPerCategory ?? 3;

  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let hiddenOperationalExpenseCents = 0;
  let hiddenOperationalCount = 0;

  const expensesByCategory = new Map<string, number>();
  const subcategoriesByCategory = new Map<string, Map<string, number>>();

  for (const transaction of transactions) {
    if (transaction.incomeCents > 0) {
      totalIncomeCents += transaction.incomeCents;
    }

    if (transaction.expenseCents === 0) {
      continue;
    }

    totalExpenseCents += transaction.expenseCents;

    const categoryLabel =
      transaction.parentCategoryName?.trim() ||
      transaction.categoryName?.trim() ||
      "Sem categoria";
    const current = expensesByCategory.get(categoryLabel) ?? 0;
    expensesByCategory.set(categoryLabel, current + transaction.expenseCents);

    // Subcategory flow is added only when category hierarchy exists (parent -> child).
    if (transaction.parentCategoryName?.trim()) {
      const subLabel = transaction.categoryName?.trim() || "Sem categoria";
      const subMap = subcategoriesByCategory.get(categoryLabel) ?? new Map<string, number>();
      const subCurrent = subMap.get(subLabel) ?? 0;
      subMap.set(subLabel, subCurrent + transaction.expenseCents);
      subcategoriesByCategory.set(categoryLabel, subMap);
    }
  }

  const effectiveExpenseCents = Math.max(0, totalExpenseCents);
  const netSavedCents = totalIncomeCents - effectiveExpenseCents;
  const savedFlowCents = Math.max(netSavedCents, 0);
  const rawCategoryEntries = [...expensesByCategory.entries()]
    .map(([key, valueCents]) => ({ key, label: key, valueCents }))
    .filter((entry) => entry.valueCents > 0)
    .sort((left, right) => right.valueCents - left.valueCents);
  const spendingCategoryEntries = rawCategoryEntries.filter((entry) => {
    const operational = isOperationalFlowCategory(entry.label);
    if (operational) {
      hiddenOperationalExpenseCents += entry.valueCents;
      hiddenOperationalCount += 1;
    }
    return !operational;
  });
  const categoryEntries = toTopEntries(
    new Map(spendingCategoryEntries.map((entry) => [entry.key, entry.valueCents])),
    topCategoriesLimit
  );
  const minCategoryCents = Math.max(5_000, Math.round(effectiveExpenseCents * 0.06));
  const refinedCategoryEntries = categoryEntries.filter(
    (entry) => entry.label === OTHER_CATEGORIES_LABEL || entry.valueCents >= minCategoryCents
  );
  const hiddenCategoriesTotalCents = categoryEntries
    .filter((entry) => entry.label !== OTHER_CATEGORIES_LABEL && entry.valueCents < minCategoryCents)
    .reduce((sum, entry) => sum + entry.valueCents, 0);

  const consolidatedOtherCents = hiddenCategoriesTotalCents + hiddenOperationalExpenseCents;

  if (consolidatedOtherCents > 0) {
    const othersEntry = refinedCategoryEntries.find((entry) => entry.label === OTHER_CATEGORIES_LABEL);
    if (othersEntry) {
      othersEntry.valueCents += consolidatedOtherCents;
    } else {
      refinedCategoryEntries.push({
        key: OTHER_CATEGORIES_LABEL,
        label: OTHER_CATEGORIES_LABEL,
        valueCents: consolidatedOtherCents
      });
    }
  }

  const nodes: SankeyNode[] = [
    {
      id: INCOME_NODE_ID,
      label: "Receita",
      kind: "income",
      color: "#10b981",
      column: 0,
      displayValue: round2(fromAmountCents(totalIncomeCents))
    },
    {
      id: EXPENSES_NODE_ID,
      label: "Despesas",
      kind: "expenses",
      color: "#ef4444",
      column: 1,
      displayValue: round2(fromAmountCents(effectiveExpenseCents))
    }
  ];

  if (savedFlowCents > 0) {
    nodes.push({
      id: SAVED_NODE_ID,
      label: "Economizado",
      kind: "saved",
      color: "#3b82f6",
      column: 1,
      displayValue: round2(fromAmountCents(savedFlowCents))
    });
  }

  const links: SankeyLink[] = [];

  if (effectiveExpenseCents > 0) {
    links.push({
      source: INCOME_NODE_ID,
      target: EXPENSES_NODE_ID,
      value: round2(fromAmountCents(effectiveExpenseCents)),
      color: "#ef4444"
    });
  }

  if (savedFlowCents > 0) {
    links.push({
      source: INCOME_NODE_ID,
      target: SAVED_NODE_ID,
      value: round2(fromAmountCents(savedFlowCents)),
      color: "#3b82f6"
    });
  }

  for (const entry of refinedCategoryEntries) {
    const categoryId = `category:${slugify(entry.key) || "categoria"}`;
    const categoryColor = getCategoryColor(entry.label);

    nodes.push({
      id: categoryId,
      label: entry.label,
      kind: "category",
      color: categoryColor,
      column: 2,
      displayValue: round2(fromAmountCents(entry.valueCents))
    });

    links.push({
      source: EXPENSES_NODE_ID,
      target: categoryId,
      value: round2(fromAmountCents(entry.valueCents)),
      color: categoryColor
    });

    if (entry.label === OTHER_CATEGORIES_LABEL) {
      continue;
    }

    const subMap = subcategoriesByCategory.get(entry.label);
    if (!subMap || subMap.size === 0) {
      continue;
    }

    if (topSubcategoriesLimit <= 0) {
      continue;
    }

    const sortedSubs = [...subMap.entries()]
      .map(([label, valueCents]) => ({ label, valueCents }))
      .filter((item) => item.valueCents > 0)
      .sort((left, right) => right.valueCents - left.valueCents);

    if (sortedSubs.length === 0) {
      continue;
    }

    const minSubcategoryCents = Math.max(5_000, Math.round(entry.valueCents * 0.18));
    const topSubs = sortedSubs
      .slice(0, topSubcategoriesLimit)
      .filter((item) => item.valueCents >= minSubcategoryCents);
    const othersSubTotal = sortedSubs.slice(topSubcategoriesLimit).reduce(
      (sum, item) => sum + item.valueCents,
      0
    );
    if (othersSubTotal >= minSubcategoryCents) {
      topSubs.push({ label: OTHER_SUBCATEGORIES_LABEL, valueCents: othersSubTotal });
    }

    if (topSubs.length === 0) {
      continue;
    }

    const subColor = lightenHex(categoryColor, 0.32);

    for (const sub of topSubs) {
      const subId = `subcategory:${slugify(entry.key)}:${slugify(sub.label) || "subcategoria"}`;

      nodes.push({
        id: subId,
        label: sub.label,
        kind: "subcategory",
        color: subColor,
        column: 3,
        displayValue: round2(fromAmountCents(sub.valueCents))
      });

      links.push({
        source: categoryId,
        target: subId,
        value: round2(fromAmountCents(sub.valueCents)),
        color: subColor
      });
    }
  }

  return {
    nodes,
    links,
    totalIncome: round2(fromAmountCents(totalIncomeCents)),
    totalExpense: round2(fromAmountCents(totalExpenseCents)),
    netSaved: round2(fromAmountCents(netSavedCents)),
    hiddenOperationalExpense: round2(fromAmountCents(hiddenOperationalExpenseCents)),
    hiddenOperationalCount
  };
}
