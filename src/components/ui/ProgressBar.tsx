interface ProgressBarProps {
  percentage: number;
  color?: "blue" | "green" | "red" | "gray";
}

const fillColorClasses: Record<NonNullable<ProgressBarProps["color"]>, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-rose-500",
  gray: "bg-slate-500"
};

export function ProgressBar({ percentage, color = "blue" }: ProgressBarProps): React.JSX.Element {
  const normalizedValue = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  const style = {
    "--progress-width": `${normalizedValue}%`
  } as React.CSSProperties;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalizedValue)}
      className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700/70"
    >
      <div
        style={style}
        className={`h-full w-[var(--progress-width)] rounded-full transition-all duration-300 ${fillColorClasses[color]}`}
      />
    </div>
  );
}
