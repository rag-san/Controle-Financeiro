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
  iconClassName = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200",
  title,
  subtitle,
  totalLabel,
  children
}: AccountGroupCardProps): React.JSX.Element {
  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconClassName}`}>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>
        {totalLabel ? (
          <p className="shrink-0 text-right text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {totalLabel}
          </p>
        ) : null}
      </div>
      <div className="divide-y divide-slate-200/70 dark:divide-slate-800">{children}</div>
    </Card>
  );
}
