import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
};

export function Card({ title, children, right }: CardProps) {
  return (
    <section className="app-bg-secondary app-border rounded-2xl border p-4 shadow-sm">
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
