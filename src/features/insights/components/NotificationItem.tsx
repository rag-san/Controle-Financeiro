import Link from "next/link";
import type { Insight } from "@/src/features/insights/types";

export type NotificationItemProps = {
  insight: Insight;
  onDismiss: () => void;
  onSnooze: (days: 1 | 7) => void;
};

function resolveIcon(insight: Insight): string {
  if (insight.id.includes("subscription")) return "🔁";
  if (insight.severity === "warning") return "⚠️";
  return "💡";
}

function resolveContainerClass(severity: Insight["severity"]): string {
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20";
  }

  return "border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20";
}

export function NotificationItem({
  insight,
  onDismiss,
  onSnooze
}: NotificationItemProps): React.JSX.Element {
  return (
    <li className={`rounded-xl border p-3 ${resolveContainerClass(insight.severity)}`}>
      <div className="flex items-start gap-3">
        <span className="text-base leading-none" aria-hidden="true">
          {resolveIcon(insight)}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</p>
          <p className="text-xs text-slate-700 dark:text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {insight.message}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {insight.cta ? (
              <Link
                href={insight.cta.href}
                className="rounded-md px-1.5 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-blue-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
              >
                {insight.cta.label}
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => onSnooze(1)}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Snooze for 1 day"
            >
              1d
            </button>

            <button
              type="button"
              onClick={() => onSnooze(7)}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Snooze for 7 days"
            >
              7d
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

