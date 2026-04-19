import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        <Icon size={24} />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
