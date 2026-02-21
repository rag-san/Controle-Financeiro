import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className, ...props }, ref) => (
    <BaseInput
      ref={ref}
      className={cn(invalid ? "border-destructive focus-visible:ring-destructive" : "", className)}
      aria-invalid={invalid || props["aria-invalid"]}
      {...props}
    />
  )
);

Input.displayName = "Input";

