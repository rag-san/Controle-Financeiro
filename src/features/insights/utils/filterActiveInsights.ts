import type { Insight } from "@/src/features/insights/types";

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

export function filterActiveInsights(
  insights: Insight[],
  dismissed: Set<string>,
  snoozed: Record<string, number>,
  now: number = Date.now()
): Insight[] {
  return sortInsights(
    insights.filter((insight) => {
      if (dismissed.has(insight.id)) return false;
      const snoozedUntil = snoozed[insight.id];
      if (typeof snoozedUntil === "number" && snoozedUntil > now) {
        return false;
      }
      return true;
    })
  );
}

