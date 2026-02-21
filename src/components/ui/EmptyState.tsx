import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/20">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      {ctaLabel && ctaHref ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

