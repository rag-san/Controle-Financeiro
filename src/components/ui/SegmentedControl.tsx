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
    <div
      className={cn(
        "inline-flex w-fit max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-slate-100/80 p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden dark:bg-slate-900/80",
        className
      )}
      role="group"
      aria-label={ariaLabel}
    >
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
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? "bg-blue-500 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/80 dark:text-slate-200 dark:hover:bg-slate-800"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
