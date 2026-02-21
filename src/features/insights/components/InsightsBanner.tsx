import Link from "next/link";
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

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      aria-label="Insights rápidos"
    >
      <ul className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
        {prioritized.map((insight) => (
          <li key={insight.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold">{insight.title}:</span>
            <span>{insight.message}</span>
            {insight.cta ? (
              <Link
                href={insight.cta.href}
                className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:text-blue-200"
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
