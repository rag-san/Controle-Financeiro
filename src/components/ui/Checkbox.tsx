import * as React from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  indeterminate?: boolean;
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
      if (!innerRef.current) return;
      innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <input
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") {
            ref(node);
            return;
          }
          if (ref && "current" in ref) {
            (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
          }
        }}
        type="checkbox"
        className={cn(
          "h-4 w-4 cursor-pointer rounded-full border border-border bg-card align-middle accent-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

Checkbox.displayName = "Checkbox";
