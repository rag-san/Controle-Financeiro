import * as React from "react";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { NotificationItem } from "@/src/features/insights/components/NotificationItem";
import type { Insight } from "@/src/features/insights/types";

type NotificationsDropdownProps = {
  id: string;
  insights: Insight[];
  isLoading?: boolean;
  dismissedCount?: number;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, days: 1 | 7) => void;
  onClearDismissed?: () => void;
};

export const NotificationsDropdown = React.forwardRef<HTMLDivElement, NotificationsDropdownProps>(
  (
    {
      id,
      insights,
      isLoading = false,
      dismissedCount = 0,
      onDismiss,
      onSnooze,
      onClearDismissed
    },
    ref
  ) => {
    return (
      <div
        id={id}
        ref={ref}
        role="dialog"
        aria-label="Central de notificações"
        aria-modal="false"
        tabIndex={-1}
        className="fixed inset-x-3 top-[4.5rem] z-40 max-h-[calc(100dvh-5.25rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-2xl backdrop-blur sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[380px] sm:max-h-[460px] sm:max-w-[92vw] dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div className="mb-2 flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isLoading ? "Atualizando..." : insights.length > 0 ? `${insights.length} ativas` : "Nenhuma ativa"}
            </p>
          </div>
          {dismissedCount > 0 && onClearDismissed ? (
            <button
              type="button"
              onClick={onClearDismissed}
              className="rounded-full border border-transparent px-2 py-1 text-xs text-slate-500 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Limpar dispensadas
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[96px] rounded-xl" />
            <Skeleton className="h-[96px] rounded-xl" />
            <Skeleton className="h-[96px] rounded-xl" />
          </div>
        ) : insights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Sem alertas no momento. Tudo sob controle.
          </div>
        ) : (
          <ul className="max-h-[22rem] space-y-2 overflow-auto pr-1">
            {insights.map((insight) => (
              <NotificationItem
                key={insight.id}
                insight={insight}
                onDismiss={() => onDismiss(insight.id)}
                onSnooze={(days) => onSnooze(insight.id, days)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }
);

NotificationsDropdown.displayName = "NotificationsDropdown";

