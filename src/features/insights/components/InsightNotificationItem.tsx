import Link from "next/link";
import { X } from "lucide-react";
import { IconButton } from "@/src/components/ui/IconButton";
import type { Insight } from "@/src/features/insights/types";

type InsightNotificationItemProps = {
  insight: Insight;
  onDismiss: (id: string) => void;
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

export function InsightNotificationItem({
  insight,
  onDismiss
}: InsightNotificationItemProps): React.JSX.Element {
  return (
    <li className={`rounded-xl border p-3 ${resolveContainerClass(insight.severity)}`}>
      <div className="flex items-start gap-3">
        <span className="text-base leading-none" aria-hidden="true">
          {resolveIcon(insight)}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {insight.message}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          {insight.cta ? (
            <Link
              href={insight.cta.href}
              className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-blue-300 dark:hover:bg-blue-950/50 dark:hover:text-blue-200"
            >
              {insight.cta.label}
            </Link>
          ) : null}

          <IconButton
            size="sm"
            aria-label={`Dismiss insight: ${insight.title}`}
            icon={<X className="h-4 w-4" />}
            onClick={() => onDismiss(insight.id)}
          />
        </div>
      </div>
    </li>
  );
}
