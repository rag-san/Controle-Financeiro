import Link from "next/link";
import { AlertTriangle, Lightbulb, Repeat2 } from "lucide-react";
import type { Insight } from "@/src/features/insights/types";

export type NotificationItemProps = {
  insight: Insight;
  onDismiss: () => void;
  onSnooze: (days: 1 | 7) => void;
};

function resolveIcon(insight: Insight): React.JSX.Element {
  if (insight.id.includes("subscription")) {
    return <Repeat2 className="h-4 w-4" aria-hidden="true" />;
  }

  if (insight.severity === "warning") {
    return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
  }

  return <Lightbulb className="h-4 w-4" aria-hidden="true" />;
}

function resolveIconClass(severity: Insight["severity"]): string {
  if (severity === "warning") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  }

  return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
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
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${resolveIconClass(insight.severity)}`}
          aria-hidden="true"
        >
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
              aria-label="Adiar notificacao por 1 dia"
            >
              Adiar 1d
            </button>

            <button
              type="button"
              onClick={() => onSnooze(7)}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Adiar notificacao por 7 dias"
            >
              Adiar 7d
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Dispensar notificacao"
            >
              Dispensar
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

