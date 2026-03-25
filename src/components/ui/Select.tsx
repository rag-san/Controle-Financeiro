import * as React from "react";
import { Select as BaseSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid = false, className, ...props }, ref) => (
    <BaseSelect
      ref={ref}
      className={cn(invalid ? "border-error focus-visible:ring-error" : "", className)}
      aria-invalid={invalid || props["aria-invalid"]}
      {...props}
    />
  )
);

Select.displayName = "Select";
