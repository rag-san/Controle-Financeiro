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
    <div className="rounded-xl border border-dashed border-border/75 bg-background/45 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {ctaLabel && ctaHref ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
