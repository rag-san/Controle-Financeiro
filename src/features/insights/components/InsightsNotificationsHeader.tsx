import { Button } from "@/src/components/ui/Button";

type InsightsNotificationsHeaderProps = {
  totalCount: number;
  showingCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  dismissedCount: number;
  onClearDismissed?: () => void;
};

export function InsightsNotificationsHeader({
  totalCount,
  showingCount,
  expanded,
  onToggleExpand,
  dismissedCount,
  onClearDismissed
}: InsightsNotificationsHeaderProps): React.JSX.Element {
  const hasHiddenItems = totalCount > 3;

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Insights</p>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {showingCount}/{totalCount}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {expanded && dismissedCount > 0 && onClearDismissed ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClearDismissed}>
            Limpar dispensados
          </Button>
        ) : null}

        {hasHiddenItems ? (
          <Button type="button" size="sm" variant="ghost" onClick={onToggleExpand}>
            {expanded ? "Mostrar menos" : "Ver todos"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
