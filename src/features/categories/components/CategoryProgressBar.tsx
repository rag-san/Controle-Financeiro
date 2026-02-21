import { cn } from "@/lib/utils";

type CategoryProgressBarProps = {
  percentage: number;
  color: string;
};

export function CategoryProgressBar({
  percentage,
  color
}: CategoryProgressBarProps): React.JSX.Element {
  const safePercentage = Math.max(0, Math.min(100, percentage));

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/70" aria-hidden="true">
      <span
        className={cn("block h-full rounded-full transition-[width] duration-300 ease-out")}
        style={{ width: `${safePercentage}%`, backgroundColor: color }}
      />
    </div>
  );
}
