"use client";

import { addMonths, format, isSameMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

type MonthSelectorProps = {
  currentDate: Date;
  onChange: (date: Date) => void;
};

export function MonthSelector({ currentDate, onChange }: MonthSelectorProps): React.JSX.Element {
  const isCurrentMonth = isSameMonth(currentDate, new Date());

  return (
    <div className="flex items-center rounded-full border border-border bg-card p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange(subMonths(currentDate, 1))}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronLeft size={16} />
      </button>

      <button
        type="button"
        onClick={() => {
          if (!isCurrentMonth) onChange(new Date());
        }}
        className="flex min-w-[138px] items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Calendar size={14} className="text-muted-foreground" />
        <span className="capitalize">{format(currentDate, "MMM yyyy", { locale: ptBR })}</span>
      </button>

      <button
        type="button"
        onClick={() => onChange(addMonths(currentDate, 1))}
        disabled={isCurrentMonth}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
