import type { Insight, InsightsDetectorContext } from "@/src/features/insights/types";
import { normalizeMerchant } from "@/src/features/insights/utils/merchant";

const UNCATEGORIZED_MARKERS = ["sem categoria", "uncategorized", "nao categorizado", "não categorizado"];

function isUncategorized(categoryId: string | null, categoryName: string): boolean {
  if (!categoryId) return true;

  const normalized = normalizeMerchant(categoryName);
  return UNCATEGORIZED_MARKERS.some((marker) => normalized.includes(marker));
}

export function detectUncategorized(context: InsightsDetectorContext): Insight | null {
  let count = 0;

  for (const transaction of context.currentTransactions) {
    if (isUncategorized(transaction.categoryId, transaction.categoryName)) {
      count += 1;
    }
  }

  if (count < 5) {
    return null;
  }

  return {
    id: "uncategorized-nudge",
    severity: "warning",
    title: "Transações sem categoria",
    message: `Você tem ${count} transações sem categoria neste período.`,
    why: "Classificar esses lançamentos melhora a precisão dos insights e comparações.",
    cta: {
      label: "Organizar agora",
      href: `/transactions?${context.period.currentPeriod.query}&category=uncategorized`
    },
    impact: count
  };
}
