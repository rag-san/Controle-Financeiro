import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Insight } from "@/src/features/insights/types";

type InsightsBannerProps = {
  insights: Insight[];
  maxItems?: number;
};

export function InsightsBanner({
  insights,
  maxItems = 3
}: InsightsBannerProps): React.JSX.Element | null {
  const prioritized = insights
    .filter((insight) => {
      return (
        insight.id.includes("uncategorized") ||
        insight.id.includes("duplicate") ||
        insight.id.includes("subscription")
      );
    })
    .slice(0, Math.max(1, maxItems));

  if (prioritized.length === 0) {
    return null;
  }

  const getInsightTone = (id: string): string => {
    if (id.includes("uncategorized")) {
      return "border-warning/20 bg-warning/10 text-warning";
    }

    if (id.includes("duplicate")) {
      return "border-error/20 bg-error/10 text-error";
    }

    return "border-info/25 bg-info/10 text-info";
  };

  return (
    <section
      className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm dark:border-border dark:bg-card"
      aria-label="Insights rápidos"
    >
      <ul className="flex flex-col gap-2">
        {prioritized.map((insight) => (
          <li
            key={insight.id}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm",
              "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2",
              getInsightTone(insight.id)
            )}
          >
            <span className="font-semibold">{insight.title}:</span>
            <span>{insight.message}</span>
            {insight.cta ? (
              <Link
                href={insight.cta.href}
                className="text-xs font-semibold underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {insight.cta.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}


