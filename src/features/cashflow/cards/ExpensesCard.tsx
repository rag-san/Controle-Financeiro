import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { ExpensesStackedChart } from "@/src/features/cashflow/charts/ExpensesStackedChart";
import type { ExpensesStackedChartData } from "@/src/features/cashflow/types";
import { formatBRL, formatPercent } from "@/src/utils/format";

type ExpensesCardProps = {
  periodLabel: string;
  dateRangeLabel: string;
  totalExpense: number;
  previousTotalExpense: number;
  chartData: ExpensesStackedChartData;
  isLoading?: boolean;
};

type DeltaDescriptor = {
  badgeValue: string;
  badgeVariant: "positive" | "negative" | "neutral";
};

function resolveExpenseDelta(current: number, previous: number): DeltaDescriptor {
  if (previous === 0) {
    return {
      badgeValue: "↔ N/A",
      badgeVariant: "neutral"
    };
  }

  const deltaPercent = ((current - previous) / previous) * 100;
  const rounded = Number(deltaPercent.toFixed(1));

  if (rounded === 0) {
    return {
      badgeValue: "↔ 0,0%",
      badgeVariant: "neutral"
    };
  }

  const direction = rounded > 0 ? "↑" : "↓";
  const value = rounded > 0 ? `+${formatPercent(rounded)}` : formatPercent(rounded);

  return {
    badgeValue: `${direction} ${value}`,
    badgeVariant: rounded > 0 ? "negative" : "positive"
  };
}

export function ExpensesCard({
  periodLabel,
  dateRangeLabel,
  totalExpense,
  previousTotalExpense,
  chartData,
  isLoading = false
}: ExpensesCardProps): React.JSX.Element {
  const delta = resolveExpenseDelta(totalExpense, previousTotalExpense);

  return (
    <Card
      className="flex h-full flex-col space-y-4 rounded-2xl border border-slate-700/70 bg-[linear-gradient(135deg,#020817,#04112a_60%,#0a1730)] text-slate-100 shadow-[0_12px_30px_rgba(2,6,23,0.55)]"
      aria-busy={isLoading}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">GASTOS</p>
          <p className="text-[1.75rem] font-black tracking-tight text-rose-400">{formatBRL(totalExpense)}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Badge
              value={delta.badgeValue}
              variant={delta.badgeVariant}
              className="border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs font-bold text-slate-200"
            />
            <span>vs {formatBRL(previousTotalExpense)} no período anterior</span>
          </div>
          <p className="text-xs text-slate-500">{dateRangeLabel}</p>
        </div>
        <Link
          href="/transactions?type=expense"
          className="text-xs font-semibold text-indigo-400 transition hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ver mais sobre gastos"
        >
          Ver mais ↗
        </Link>
      </div>

      <ExpensesStackedChart
        data={chartData}
        loading={isLoading}
        a11ySummary={`Gráfico de gastos mensais empilhados por categoria para ${periodLabel}.`}
      />
    </Card>
  );
}
