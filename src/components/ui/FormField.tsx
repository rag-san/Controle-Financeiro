import * as React from "react";
import { cn } from "@/lib/utils";

type FieldA11yProps = {
  id: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

type FormFieldProps = {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (fieldProps: FieldA11yProps) => React.ReactNode;
};

export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children
}: FormFieldProps): React.JSX.Element {
  const reactId = React.useId();
  const sanitizedId = reactId.replace(/:/g, "");
  const inputId = id ?? `field-${sanitizedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({
        id: inputId,
        required,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error)
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

