import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Card({ children, className, ...props }: CardProps): React.JSX.Element {
  return (
    <section
      {...props}
      className={cn(
        "rounded-2xl border border-border/90 bg-card p-6 text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className, ...props }: CardProps): React.JSX.Element {
  return (
    <header {...props} className={cn("mb-4 space-y-2", className)}>
      {children}
    </header>
  );
}

export function CardTitle({ children, className, ...props }: CardProps): React.JSX.Element {
  return (
    <h2
      {...props}
      className={cn(
        "text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className
      )}
    >
      {children}
    </h2>
  );
}

export function CardContent({ children, className, ...props }: CardProps): React.JSX.Element {
  return (
    <div {...props} className={cn("space-y-4", className)}>
      {children}
    </div>
  );
}
