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
  classifiedIncome?: number;
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
  classifiedIncome,
  chartData,
  isLoading = false
}: IncomeCardProps): React.JSX.Element {
  const delta = resolveIncomeDelta(totalIncome, previousTotalIncome);
  const hasIncomeData = chartData.some((row) => row.income > 0);

  return (
    <Card
      className="flex h-full flex-col space-y-4 text-foreground"
      aria-busy={isLoading}
      data-testid="cashflow-income-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">ENTRADAS DE CAIXA</p>
          <p className="break-words text-[1.6rem] font-black tracking-tight text-emerald-700 dark:text-emerald-300 sm:text-[1.9rem]">
            {formatBRL(totalIncome)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              value={delta.badgeValue}
              variant={delta.badgeVariant}
              className="border border-border bg-secondary/70 px-2 py-0.5 text-xs font-bold text-foreground"
            />
            <span>vs {formatBRL(previousTotalIncome)} no período anterior</span>
          </div>
          {typeof classifiedIncome === "number" ? (
            <p className="text-xs text-muted-foreground">
              Receitas classificadas no período: {formatBRL(classifiedIncome)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{dateRangeLabel}</p>
        </div>
        <Link
          href="/transactions?type=income"
          className="self-start text-xs font-semibold text-primary transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/12 text-base text-emerald-700 dark:text-emerald-300 shadow-[0_10px_24px_rgba(16,185,129,0.2)]">
            ↗
          </span>
          <p className="text-xs text-muted-foreground">Nenhuma entrada de caixa no período</p>
          <Link
            href="/transactions?new=1&type=income"
            className="text-sm font-semibold text-primary transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + Adicionar receita
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

