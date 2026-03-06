import { cn } from "@/lib/utils";

type MiniWeightBarProps = {
  weight: number;
  color: string;
  segments?: number;
};

export function MiniWeightBar({
  weight,
  color,
  segments = 10
}: MiniWeightBarProps): React.JSX.Element {
  const safeWeight = Math.max(0, Math.min(100, weight));
  const filledCount = safeWeight > 0 ? Math.max(1, Math.round((safeWeight / 100) * segments)) : 0;

  return (
    <div className="flex items-end gap-1" aria-hidden="true">
      {Array.from({ length: segments }).map((_, index) => {
        const filled = index < filledCount;

        return (
          <span
            key={`mini-weight-${index}`}
            className={cn(
              "h-3 w-1.5 rounded-sm transition-all duration-300 ease-out",
              filled
                ? "bg-muted-foreground"
                : "bg-secondary/70 dark:bg-secondary"
            )}
            style={filled ? { backgroundColor: color, transitionDelay: `${index * 20}ms` } : undefined}
          />
        );
      })}
    </div>
  );
}

