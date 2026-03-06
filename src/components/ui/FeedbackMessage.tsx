import * as React from "react";
import { cn } from "@/lib/utils";

type FeedbackVariant = "info" | "success" | "warning" | "error";

const variantClasses: Record<FeedbackVariant, string> = {
  info: "feedback-message--info",
  success: "feedback-message--success",
  warning: "feedback-message--warning",
  error: "feedback-message--error"
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
      className={cn("feedback-message", variantClasses[variant], className)}
    >
      {children}
    </div>
  );
}

