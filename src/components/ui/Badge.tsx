import { cn } from "@/lib/utils";

interface BadgeProps {
  value: string;
  variant: "positive" | "negative" | "neutral";
}

const variantStyles: Record<BadgeProps["variant"], string> = {
  positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  negative: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200"
};

export function Badge({ value, variant }: BadgeProps): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-medium", variantStyles[variant])}>
      {value}
    </span>
  );
}
