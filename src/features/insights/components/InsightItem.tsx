import Link from "next/link";
import type { Insight } from "@/src/features/insights/types";

type InsightItemProps = {
  insight: Insight;
};

function resolveIcon(insight: Insight): string {
  if (insight.id.includes("subscription")) return "🔁";
  if (insight.severity === "warning") return "⚠️";
  return "💡";
}

function resolveContainerClass(severity: Insight["severity"]): string {
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20";
  }

  return "border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/20";
}

export function InsightItem({ insight }: InsightItemProps): React.JSX.Element {
  return (
    <li className={`rounded-xl border p-3 ${resolveContainerClass(insight.severity)}`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-none" aria-hidden="true">
          {resolveIcon(insight)}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{insight.message}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Por quê: {insight.why}</p>
          {insight.cta ? (
            <Link
              href={insight.cta.href}
              className="inline-flex items-center text-xs font-semibold text-blue-600 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-blue-300 dark:hover:text-blue-200"
            >
              {insight.cta.label} →
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
