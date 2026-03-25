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
      className="overflow-hidden rounded-[24px] border border-border/80 bg-gradient-to-b from-card via-card to-secondary/60 px-5 py-5 shadow-[0_16px_38px_hsl(var(--overlay)/0.08)] sm:px-6"
      data-testid="categories-month-summary-card"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.8fr)] lg:items-center">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Total gasto
            </p>
            <p className="tabular-nums text-[1.7rem] font-black leading-none tracking-tight text-foreground sm:text-[2.1rem]">
              {formatBRL(totalSpent)}
            </p>
            <p className="text-sm text-muted-foreground sm:text-[15px]">
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
                  <span className="truncate text-foreground">{slice.label}</span>
                  <span className="tabular-nums font-bold text-foreground">
                    {formatLegendPercentage(slice.percentage)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_hsl(var(--overlay)/0.05)]">
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

            <div className="inline-flex w-full items-center justify-between gap-2.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-foreground shadow-[0_8px_18px_hsl(var(--overlay)/0.08)] backdrop-blur">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onPreviousMonth}
                aria-label="Mês anterior"
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <p className="flex-1 text-center text-sm font-semibold tracking-tight text-foreground sm:text-[15px]">
                {monthLabel}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onNextMonth}
                aria-label="Próximo mês"
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
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
