import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { NetResultChart } from "@/src/features/cashflow/charts/NetResultChart";
import type { NetResultRow } from "@/src/features/cashflow/types";
import { formatBRL, formatPercent } from "@/src/utils/format";

type NetResultCardProps = {
  dateRangeLabel: string;
  cashBalance: number;
  periodCashFlow: number;
  previousPeriodCashFlow: number;
  chartData: NetResultRow[];
  isLoading?: boolean;
};

type DeltaDescriptor = {
  badgeValue: string;
  badgeVariant: "positive" | "negative" | "neutral";
};

function resolveNetDelta(current: number, previous: number): DeltaDescriptor {
  if (previous === 0) {
    return {
      badgeValue: "↔ N/A",
      badgeVariant: "neutral"
    };
  }

  const deltaPercent = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Number(deltaPercent.toFixed(1));

  if (rounded === 0) {
    return {
      badgeValue: "↔ 0,0%",
      badgeVariant: "neutral"
    };
  }

  const direction = rounded > 0 ? "↑" : "↓";
  const badgeValue = rounded > 0 ? `${direction} +${formatPercent(rounded)}` : `${direction} ${formatPercent(rounded)}`;

  return {
    badgeValue,
    badgeVariant: rounded > 0 ? "positive" : "negative"
  };
}

export function NetResultCard({
  dateRangeLabel,
  cashBalance,
  periodCashFlow,
  previousPeriodCashFlow,
  chartData,
  isLoading = false
}: NetResultCardProps): React.JSX.Element {
  const valueClassName =
    cashBalance >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300";
  const delta = resolveNetDelta(periodCashFlow, previousPeriodCashFlow);
  const periodFlowLabel =
    periodCashFlow >= 0 ? `+ ${formatBRL(Math.abs(periodCashFlow))}` : `- ${formatBRL(Math.abs(periodCashFlow))}`;

  return (
    <Card
      className="space-y-4 rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-secondary/70 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-border dark:from-card dark:via-card dark:to-secondary/70"
      aria-busy={isLoading}
      data-testid="cashflow-net-result-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            SALDO EM CONTA
          </p>
          <p className="text-xs text-muted-foreground">Saldo atual consolidado das contas de caixa</p>
          <p className={`break-words text-[1.85rem] font-black tracking-tight sm:text-[2.1rem] ${valueClassName}`}>
            {formatBRL(cashBalance)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              value={delta.badgeValue}
              variant={delta.badgeVariant}
              className="px-2 py-0.5 text-xs font-bold"
            />
            <span>Variação real em {dateRangeLabel}: {periodFlowLabel}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            <span>vs {formatBRL(previousPeriodCashFlow)} no período anterior</span>
          </div>
        </div>
        <Link
          href="/reports"
          className="self-start text-xs font-semibold text-primary transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ver mais sobre saldo em conta"
        >
          Ver mais ↗
        </Link>
      </div>

      <div className="mt-2 rounded-xl border border-border/80 bg-card/80 p-2 dark:border-border dark:bg-card/85">
        <NetResultChart
          data={chartData}
          loading={isLoading}
          a11ySummary={`Gráfico de variação real de caixa mensal para ${dateRangeLabel}.`}
        />
      </div>
    </Card>
  );
}


