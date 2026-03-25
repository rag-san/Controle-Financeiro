import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps {
  value: string;
  variant: "positive" | "negative" | "neutral";
  className?: string;
}

const variantClassMap: Record<BadgeProps["variant"], string> = {
  positive: "bg-success/10 text-success",
  negative: "bg-error/10 text-error",
  neutral: "bg-muted text-muted-foreground"
};

export function Badge({ value, variant, className }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium",
        variantClassMap[variant],
        className
      )}
    >
      {value}
    </span>
  );
}
