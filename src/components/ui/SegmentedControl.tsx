import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<Value extends string> = {
  label: string;
  value: Value;
};

interface SegmentedControlProps<Value extends string> {
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onChange: (nextValue: Value) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className
}: SegmentedControlProps<Value>): React.JSX.Element {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  const handleArrowNavigation = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    event.preventDefault();

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + options.length) % options.length;
    const nextOption = options[nextIndex];

    onChange(nextOption.value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)} role="group" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleArrowNavigation(event, index)}
            aria-pressed={isActive}
            tabIndex={index === selectedIndex ? 0 : -1}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "bg-blue-500 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
