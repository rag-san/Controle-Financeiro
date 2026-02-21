"use client";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="flex min-h-[68px] items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

