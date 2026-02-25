import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  percentage: number;
  color?: "blue" | "green" | "red" | "gray";
  className?: string;
}

const colorClassMap: Record<NonNullable<ProgressBarProps["color"]>, string> = {
  blue: "bg-primary",
  green: "bg-emerald-500",
  red: "bg-rose-500",
  gray: "bg-muted-foreground/40"
};

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function ProgressBar({ percentage, color = "blue", className }: ProgressBarProps): React.JSX.Element {
  const normalized = clampPercentage(percentage);

  return (
    <div
      className={cn("h-2.5 w-full rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized)}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-300", colorClassMap[color])}
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}
