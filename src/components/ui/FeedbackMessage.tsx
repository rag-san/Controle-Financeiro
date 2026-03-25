import * as React from "react";
import { cn } from "@/lib/utils";

type FeedbackVariant = "info" | "success" | "warning" | "error";

const variantClasses: Record<FeedbackVariant, string> = {
  info: "border-border bg-muted/50 text-muted-foreground",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  error: "border-error/20 bg-error/10 text-error"
};

type FeedbackMessageProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: FeedbackVariant;
  role?: "status" | "alert";
  live?: "polite" | "assertive" | "off";
};

export function FeedbackMessage({
  variant = "info",
  className,
  role,
  live,
  children,
  ...props
}: FeedbackMessageProps): React.JSX.Element {
  const resolvedRole = role ?? (variant === "error" ? "alert" : "status");
  const resolvedLive = live ?? (variant === "error" ? "assertive" : "polite");

  return (
    <div
      {...props}
      role={resolvedRole}
      aria-live={resolvedLive}
      className={cn("rounded-xl border p-3 text-sm", variantClasses[variant], className)}
    >
      {children}
    </div>
  );
}

