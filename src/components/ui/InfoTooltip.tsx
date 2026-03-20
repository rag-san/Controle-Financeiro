"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type InfoTooltipProps = {
  content: string;
  ariaLabel?: string;
  className?: string;
};

export function InfoTooltip({
  content,
  ariaLabel = "Mais informações",
  className
}: InfoTooltipProps): React.JSX.Element {
  const tooltipId = React.useId().replace(/:/g, "");
  const [open, setOpen] = React.useState(false);

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/80 bg-card/90 text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 top-[calc(100%+0.5rem)] z-50 w-56 -translate-x-1/2 rounded-xl border border-border/85 bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-xl transition",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
        )}
      >
        {content}
      </span>
    </span>
  );
}
