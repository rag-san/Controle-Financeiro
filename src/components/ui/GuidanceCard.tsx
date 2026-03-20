import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/src/components/ui/Card";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip";

type GuidanceCardProps = {
  eyebrow?: string;
  title: string;
  description: string;
  tooltip?: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
};

export function GuidanceCard({
  eyebrow,
  title,
  description,
  tooltip,
  ctaLabel,
  ctaHref,
  className
}: GuidanceCardProps): React.JSX.Element {
  return (
    <Card className={cn("h-full p-4 sm:p-5", className)}>
      <div className="flex h-full flex-col gap-4">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex items-start gap-2">
            <h3 className="text-base font-semibold leading-tight text-foreground">{title}</h3>
            {tooltip ? <InfoTooltip content={tooltip} ariaLabel={`Saiba mais sobre ${title}`} /> : null}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>

        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
