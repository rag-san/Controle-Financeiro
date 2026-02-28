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
  const valueClassName = totalNet >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300";
  const delta = resolveNetDelta(totalNet, previousTotalNet);

  return (
    <Card
      className="space-y-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/70 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/70"
      aria-busy={isLoading}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            RESULTADO LÍQUIDO
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{dateRangeLabel}</p>
          <p className={`text-[2.1rem] font-black tracking-tight ${valueClassName}`}>{formatBRL(totalNet)}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Badge
              value={delta.badgeValue}
              variant={delta.badgeVariant}
              className="px-2 py-0.5 text-xs font-bold"
            />
            <span>vs {formatBRL(previousTotalNet)} no período anterior</span>
          </div>
        </div>
        <Link
          href="/reports"
          className="text-xs font-semibold text-sky-700 transition hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300 dark:hover:text-sky-200"
          aria-label="Ver mais sobre resultado líquido"
        >
          Ver mais ↗
        </Link>
      </div>

      <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-950/60">
        <NetResultChart
          data={chartData}
          loading={isLoading}
          a11ySummary={`Gráfico de resultado líquido mensal para ${dateRangeLabel}.`}
        />
      </div>
    </Card>
  );
}
