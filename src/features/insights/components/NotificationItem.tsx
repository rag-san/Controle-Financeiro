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
    return "border-l-4 border-l-amber-400";
  }

  return "border-l-4 border-l-blue-400";
}

function resolveSeverityBadge(severity: Insight["severity"]): { label: string; className: string } {
  if (severity === "warning") {
    return {
      label: "Atenção",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
    };
  }

  return {
    label: "Info",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
  };
}

export function NotificationItem({
  insight,
  onDismiss,
  onSnooze
}: NotificationItemProps): React.JSX.Element {
  const badge = resolveSeverityBadge(insight.severity);

  return (
    <li
      className={[
        "rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md",
        "dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-700",
        resolveContainerClass(insight.severity)
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${resolveIconClass(insight.severity)}`}
          aria-hidden="true"
        >
          {resolveIcon(insight)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-5 text-slate-900 dark:text-slate-100">{insight.title}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
            {insight.message}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {insight.cta ? (
              <Link
                href={insight.cta.href}
                className="inline-flex h-7 items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
              >
                {insight.cta.label}
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => onSnooze(1)}
              className="inline-flex h-7 items-center rounded-full border border-transparent px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Adiar notificacao por 1 dia"
            >
              Adiar 1d
            </button>

            <button
              type="button"
              onClick={() => onSnooze(7)}
              className="inline-flex h-7 items-center rounded-full border border-transparent px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Adiar notificacao por 7 dias"
            >
              Adiar 7d
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-7 items-center rounded-full border border-transparent px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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

