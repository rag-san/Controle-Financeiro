import { Card } from "@/src/components/ui/Card";

type AccountGroupCardProps = {
  icon: React.ReactNode;
  iconClassName?: string;
  title: string;
  subtitle: string;
  totalLabel?: string;
  children: React.ReactNode;
};

export function AccountGroupCard({
  icon,
  iconClassName = "bg-secondary text-muted-foreground dark:bg-secondary dark:text-foreground",
  title,
  subtitle,
  totalLabel,
  children
}: AccountGroupCardProps): React.JSX.Element {
  return (
    <Card className="overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-sm dark:border-border dark:bg-card">
      <div className="flex flex-col gap-3 border-b border-border/80 bg-secondary/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-border dark:bg-secondary/40">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconClassName}`}>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {totalLabel ? (
          <p className="max-w-full shrink-0 break-words text-right text-xl font-semibold tracking-tight text-foreground sm:text-2xl dark:text-foreground">
            {totalLabel}
          </p>
        ) : null}
      </div>
      <div className="divide-y divide-border/70 dark:divide-border">{children}</div>
    </Card>
  );
}


