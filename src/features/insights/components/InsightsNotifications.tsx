"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { InsightNotificationItem } from "@/src/features/insights/components/InsightNotificationItem";
import { InsightsNotificationsHeader } from "@/src/features/insights/components/InsightsNotificationsHeader";
import type { Insight } from "@/src/features/insights/types";

type InsightsNotificationsProps = {
  insights: Insight[];
  isLoading?: boolean;
  dismissedCount?: number;
  onDismiss: (id: string) => void;
  onClearDismissed?: () => void;
};

const DEFAULT_VISIBLE_COUNT = 3;

export function InsightsNotifications({
  insights,
  isLoading = false,
  dismissedCount = 0,
  onDismiss,
  onClearDismissed
}: InsightsNotificationsProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const previousVisibleCountRef = useRef(0);

  const visibleInsights = useMemo(() => insights, [insights]);

  useEffect(() => {
    const currentCount = visibleInsights.length;
    const previousCount = previousVisibleCountRef.current;

    if (currentCount > previousCount && !isLoading) {
      const addedCount = currentCount - previousCount;
      setLiveMessage(
        addedCount === 1 ? "Novo insight disponível." : `${addedCount} novos insights disponíveis.`
      );
    } else {
      setLiveMessage("");
    }

    previousVisibleCountRef.current = currentCount;
  }, [visibleInsights.length, isLoading]);

  const displayedInsights = expanded
    ? visibleInsights
    : visibleInsights.slice(0, DEFAULT_VISIBLE_COUNT);

  return (
    <section role="region" aria-label="Insights notifications" className="space-y-2">
      <span className="sr-only" aria-live="polite">
        {liveMessage}
      </span>

      <InsightsNotificationsHeader
        totalCount={visibleInsights.length}
        showingCount={displayedInsights.length}
        expanded={expanded}
        dismissedCount={dismissedCount}
        onToggleExpand={() => setExpanded((current) => !current)}
        onClearDismissed={onClearDismissed}
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-[74px] rounded-xl" />
          <Skeleton className="h-[74px] rounded-xl" />
          <Skeleton className="h-[74px] rounded-xl" />
        </div>
      ) : displayedInsights.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Sem notificações no momento.
        </div>
      ) : (
        <ul className="space-y-2 transition-all duration-200">
          {displayedInsights.map((insight) => (
            <InsightNotificationItem key={insight.id} insight={insight} onDismiss={onDismiss} />
          ))}
        </ul>
      )}
    </section>
  );
}
