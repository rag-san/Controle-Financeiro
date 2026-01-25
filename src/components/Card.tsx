import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function Card({ title, children, right, className }: CardProps) {
  return (
    <section
      className={`app-card-surface app-border rounded-2xl border p-4 shadow-sm ${className ?? ""}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="app-text-muted text-sm font-medium">
          {title}
        </h2>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
