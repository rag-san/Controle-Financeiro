import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { CategoriesDonut } from "@/src/features/categories/charts/CategoriesDonut";
import type { CategoryDonutSlice } from "@/src/features/categories/utils/categoryAggregates";
import { formatBRL, formatMonthYearPtBr } from "@/src/utils/format";

type CategoriesMonthSummaryCardProps = {
  totalSpent: number;
  monthDate: Date;
  slices: CategoryDonutSlice[];
  onPreviousMonth: () => void;
  onNextMonth: () => void;
};

function formatCenterValue(value: number): string {
  const rounded = Math.round(Math.max(0, value));
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(rounded);
}

function formatLegendPercentage(percentage: number): string {
  if (percentage <= 0) {
    return "0%";
  }

  if (percentage < 1) {
    return "<1%";
  }

  return `${Math.round(percentage)}%`;
}

export function CategoriesMonthSummaryCard({
  totalSpent,
  monthDate,
  slices,
  onPreviousMonth,
  onNextMonth
}: CategoriesMonthSummaryCardProps): React.JSX.Element {
  const monthLabel = formatMonthYearPtBr(monthDate);
  const hasSpending = totalSpent > 0 && slices.length > 0;
  const legendItems = hasSpending ? slices.slice(0, 6) : [];

  return (
    <Card
      className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(243,246,251,0.96)_42%,_rgba(235,240,247,0.98)_100%)] px-5 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.07)] dark:border-slate-800/90 dark:bg-[radial-gradient(circle_at_top,_rgba(18,26,47,0.96),_rgba(15,23,42,0.98)_48%,_rgba(9,16,32,1)_100%)] sm:px-6"
      data-testid="categories-month-summary-card"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.8fr)] lg:items-center">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Total gasto
            </p>
            <p className="tabular-nums text-[1.7rem] font-black leading-none tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2.1rem]">
              {formatBRL(totalSpent)}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 sm:text-[15px]">
              gasto em {monthLabel}
            </p>
          </div>

          {legendItems.length > 0 ? (
            <ul className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
              {legendItems.map((slice) => (
                <li
                  key={slice.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-[13px] sm:text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-[4px]"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-slate-600 dark:text-slate-300">{slice.label}</span>
                  <span className="tabular-nums font-bold text-slate-950 dark:text-slate-50">
                    {formatLegendPercentage(slice.percentage)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300/90 bg-white/65 px-4 py-4 text-sm text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-slate-700 dark:bg-slate-900/35 dark:text-slate-400">
              Nenhum gasto classificado neste mês.
            </div>
          )}
        </div>

        <div className="flex justify-center lg:justify-self-end">
          <div className="flex w-full max-w-[15rem] flex-col items-center gap-3 sm:max-w-[16rem]">
            <CategoriesDonut
              slices={slices}
              centerLabel={hasSpending ? "GASTOS" : "SEM GASTOS"}
              centerValue={hasSpending ? formatCenterValue(totalSpent) : formatBRL(0)}
              className="h-56 w-56 sm:h-60 sm:w-60"
            />

            <div className="inline-flex w-full items-center justify-between gap-2.5 rounded-full border border-slate-300/85 bg-white/70 px-2.5 py-1.5 text-slate-700 shadow-[0_8px_18px_rgba(148,163,184,0.14)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/45 dark:text-slate-100">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onPreviousMonth}
                aria-label="Mês anterior"
                className="h-8 w-8 shrink-0 rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <p className="flex-1 text-center text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[15px]">
                {monthLabel}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onNextMonth}
                aria-label="Próximo mês"
                className="h-8 w-8 shrink-0 rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
