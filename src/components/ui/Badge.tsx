import { cn } from "@/lib/utils";

interface BadgeProps {
  value: string;
  variant: "positive" | "negative" | "neutral";
}

const variantStyles: Record<BadgeProps["variant"], string> = {
  positive: "bg-emerald-100 text-emerald-700",
  negative: "bg-rose-100 text-rose-700",
  neutral: "bg-slate-100 text-slate-700"
};

export function Badge({ value, variant }: BadgeProps): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-medium", variantStyles[variant])}>
      {value}
    </span>
  );
}

