import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps): React.JSX.Element {
  return (
    <section className={cn("rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm", className)}>
      {children}
    </section>
  );
}

