import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { IncomeChart } from "@/src/features/cashflow/charts/IncomeChart";
import type { IncomeRow } from "@/src/features/cashflow/types";
import { formatBRL, formatPercent } from "@/src/utils/format";

type IncomeCardProps = {
  dateRangeLabel: string;
  totalIncome: number;
  previousTotalIncome: number;
  chartData: IncomeRow[];
  isLoading?: boolean;
};

type DeltaDescriptor = {
  badgeValue: string;
  badgeVariant: "positive" | "negative" | "neutral";
};

function resolveIncomeDelta(current: number, previous: number): DeltaDescriptor {
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
    badgeVariant: rounded > 0 ? "positive" : "negative"
  };
}

export function IncomeCard({
  dateRangeLabel,
  totalIncome,
  previousTotalIncome,
  chartData,
  isLoading = false
}: IncomeCardProps): React.JSX.Element {
  const delta = resolveIncomeDelta(totalIncome, previousTotalIncome);
  const hasIncomeData = chartData.some((row) => row.income > 0);

  return (
    <Card
      className="flex h-full flex-col space-y-4 rounded-2xl border border-slate-700/70 bg-[linear-gradient(135deg,#020817,#04112a_60%,#0a1730)] text-slate-100 shadow-[0_12px_30px_rgba(2,6,23,0.55)]"
      aria-busy={isLoading}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">RECEITAS</p>
          <p className="text-[1.9rem] font-black tracking-tight text-emerald-400">{formatBRL(totalIncome)}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Badge
              value={delta.badgeValue}
              variant={delta.badgeVariant}
              className="border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs font-bold text-slate-200"
            />
            <span>vs {formatBRL(previousTotalIncome)} no período anterior</span>
          </div>
          <p className="text-xs text-slate-500">{dateRangeLabel}</p>
        </div>
        <Link
          href="/transactions?type=income"
          className="text-xs font-semibold text-indigo-400 transition hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ver mais sobre receitas"
        >
          Ver mais ↗
        </Link>
      </div>

      <IncomeChart
        data={chartData}
        loading={isLoading}
        a11ySummary={`Gráfico de receitas mensais para ${dateRangeLabel}.`}
      />

      {!hasIncomeData ? (
        <div className="flex flex-col items-center justify-center gap-1 pt-1">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/12 text-base text-emerald-300 shadow-[0_10px_24px_rgba(16,185,129,0.2)]">
            ↗
          </span>
          <p className="text-xs text-slate-400">Nenhuma receita no período</p>
          <Link
            href="/transactions?new=1&type=income"
            className="text-sm font-semibold text-indigo-400 transition hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + Adicionar receita
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
