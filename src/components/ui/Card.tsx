import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps): React.JSX.Element {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-border dark:bg-card",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: CardProps): React.JSX.Element {
  return <header className={cn("mb-4 space-y-2", className)}>{children}</header>;
}

export function CardTitle({ children, className }: CardProps): React.JSX.Element {
  return <h2 className={cn("text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-muted-foreground", className)}>{children}</h2>;
}

export function CardContent({ children, className }: CardProps): React.JSX.Element {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}
