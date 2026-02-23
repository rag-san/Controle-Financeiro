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
      return "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100";
    }

    if (id.includes("duplicate")) {
      return "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100";
    }

    return "border-blue-200 bg-blue-50/80 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100";
  };

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
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
                className="text-xs font-semibold underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
