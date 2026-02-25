import type { Insight, InsightsDetectorContext } from "@/src/features/insights/types";
import { normalizeMerchant } from "@/src/features/insights/utils/merchant";

const UNCATEGORIZED_MARKERS = ["sem categoria", "uncategorized", "nao categorizado", "não categorizado"];
const MIN_UNCATEGORIZED_COUNT = 8;
const MIN_UNCATEGORIZED_RATIO = 0.3;
const MIN_COUNT_FOR_RATIO = 4;

function isUncategorized(categoryId: string | null, categoryName: string): boolean {
  if (!categoryId) return true;

  const normalized = normalizeMerchant(categoryName);
  return UNCATEGORIZED_MARKERS.some((marker) => normalized.includes(marker));
}

export function detectUncategorized(context: InsightsDetectorContext): Insight | null {
  const totalCurrent = context.currentTransactions.length;
  if (totalCurrent === 0) {
    return null;
  }

  let count = 0;

  for (const transaction of context.currentTransactions) {
    if (isUncategorized(transaction.categoryId, transaction.categoryName)) {
      count += 1;
    }
  }

  const ratio = count / totalCurrent;
  const shouldNotify =
    count >= MIN_UNCATEGORIZED_COUNT || (count >= MIN_COUNT_FOR_RATIO && ratio >= MIN_UNCATEGORIZED_RATIO);

  if (!shouldNotify) {
    return null;
  }

  return {
    id: "uncategorized-nudge",
    severity: count >= MIN_UNCATEGORIZED_COUNT ? "warning" : "info",
    title: "Transações sem categoria",
    message: `Você tem ${count} transações sem categoria neste período (${Math.round(ratio * 100)}%).`,
    why: "Classificar esses lançamentos melhora a precisão dos insights e comparações.",
    cta: {
      label: "Organizar agora",
      href: `/transactions?${context.period.currentPeriod.query}&category=uncategorized`
    },
    impact: count
  };
}
