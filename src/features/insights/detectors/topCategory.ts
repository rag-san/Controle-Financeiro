import { formatBRL, formatPercent } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext } from "@/src/features/insights/types";
import { toPercentChange } from "@/src/features/insights/utils/stats";

export function detectTopCategory(context: InsightsDetectorContext): Insight | null {
  if (context.categoryTotalsCurrent.size === 0) {
    return null;
  }

  const topCategory = [...context.categoryTotalsCurrent.values()].sort((left, right) => right.total - left.total)[0];
  if (!topCategory || topCategory.total <= 0) {
    return null;
  }

  const previous = context.categoryTotalsPrevious.get(topCategory.categoryId ?? "__uncategorized")?.total ?? 0;
  const delta = toPercentChange(topCategory.total, previous);
  const trendText =
    delta === null
      ? "sem base comparativa"
      : delta >= 0
        ? `alta de ${formatPercent(Math.abs(delta))}`
        : `queda de ${formatPercent(Math.abs(delta))}`;

  return {
    id: "top-category",
    severity: "info",
    title: "Categoria com maior gasto",
    message: `${topCategory.categoryName} é sua #1 (${formatBRL(topCategory.total)}), ${trendText} vs período anterior.`,
    why: `Atual: ${formatBRL(topCategory.total)} | Anterior: ${formatBRL(previous)}.`,
    cta: topCategory.categoryId
      ? {
          label: "Ver transações",
          href: `/transactions?${context.period.currentPeriod.query}&type=expense&categoryId=${encodeURIComponent(topCategory.categoryId)}`
        }
      : undefined,
    impact: topCategory.total
  };
}
