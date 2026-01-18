import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
};

export function Card({ title, children, right }: CardProps) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-500">{title}</h2>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
