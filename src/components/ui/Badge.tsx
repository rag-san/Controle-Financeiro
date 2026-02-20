import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps {
  value: string;
  variant: "positive" | "negative" | "neutral";
  className?: string;
}

const variantClassMap: Record<BadgeProps["variant"], string> = {
  positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  negative: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
