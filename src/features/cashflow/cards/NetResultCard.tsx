import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { NetResultChart } from "@/src/features/cashflow/charts/NetResultChart";
import type { NetResultRow } from "@/src/features/cashflow/types";
import { formatBRL, formatPercent } from "@/src/utils/format";

type NetResultCardProps = {
  dateRangeLabel: string;
  totalNet: number;
  previousTotalNet: number;
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
  totalNet,
  previousTotalNet,
  chartData,
  isLoading = false
}: NetResultCardProps): React.JSX.Element {
  const valueClassName = totalNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const delta = resolveNetDelta(totalNet, previousTotalNet);

  return (
    <Card
      className="space-y-4 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
      aria-busy={isLoading}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            RESULTADO LÍQUIDO
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{dateRangeLabel}</p>
          <p className={`text-3xl font-semibold ${valueClassName}`}>{formatBRL(totalNet)}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Badge
              value={delta.badgeValue}
              variant={delta.badgeVariant}
              className="border border-current/20 px-2 py-0.5 text-xs"
            />
            <span>vs {formatBRL(previousTotalNet)} no período anterior</span>
          </div>
        </div>
        <Link
          href="/reports"
          className="text-xs font-medium text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-slate-400 dark:hover:text-slate-200"
          aria-label="Ver mais sobre resultado líquido"
        >
          Ver mais ↗
        </Link>
      </div>

      <div className="mt-2">
        <NetResultChart
          data={chartData}
          loading={isLoading}
          a11ySummary={`Gráfico de resultado líquido mensal para ${dateRangeLabel}.`}
        />
      </div>
    </Card>
  );
}
