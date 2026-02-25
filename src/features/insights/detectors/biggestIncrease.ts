import { formatBRL } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext } from "@/src/features/insights/types";

const MIN_INCREASE_TO_NOTIFY = 80;
const MIN_CURRENT_TOTAL = 120;
const WARNING_INCREASE_THRESHOLD = 300;

export function detectBiggestIncrease(context: InsightsDetectorContext): Insight | null {
  const keys = new Set<string>([
    ...context.categoryTotalsCurrent.keys(),
    ...context.categoryTotalsPrevious.keys()
  ]);

  let best:
    | {
        key: string;
        categoryId: string | null;
        categoryName: string;
        increase: number;
        current: number;
        previous: number;
      }
    | null = null;

  for (const key of keys) {
    const current = context.categoryTotalsCurrent.get(key);
    const previous = context.categoryTotalsPrevious.get(key);
    const currentTotal = current?.total ?? 0;
    const previousTotal = previous?.total ?? 0;
    const increase = currentTotal - previousTotal;

    if (increase < MIN_INCREASE_TO_NOTIFY || currentTotal < MIN_CURRENT_TOTAL) {
      continue;
    }

    if (!best || increase > best.increase) {
      best = {
        key,
        categoryId: current?.categoryId ?? previous?.categoryId ?? null,
        categoryName: current?.categoryName ?? previous?.categoryName ?? "Sem categoria",
        increase,
        current: currentTotal,
        previous: previousTotal
      };
    }
  }

  if (!best) {
    return null;
  }

  return {
    id: "biggest-increase",
    severity: best.increase >= WARNING_INCREASE_THRESHOLD ? "warning" : "info",
    title: "Maior aumento de gasto",
    message: `${best.categoryName} aumentou ${formatBRL(best.increase)} vs período anterior.`,
    why: `Atual: ${formatBRL(best.current)} | Anterior: ${formatBRL(best.previous)}.`,
    cta: best.categoryId
      ? {
          label: "Explorar categoria",
          href: `/transactions?${context.period.currentPeriod.query}&type=expense&categoryId=${encodeURIComponent(best.categoryId)}`
        }
      : undefined,
    impact: best.increase
  };
}
