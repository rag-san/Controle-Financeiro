import { formatBRL, formatDateLong } from "@/src/utils/format";
import type { NetWorthChartPoint } from "@/src/features/networth/types";

type TooltipPayloadEntry = {
  color?: string;
  dataKey?: string;
  value?: number;
  payload?: NetWorthChartPoint;
};

type NetWorthComparisonTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
};

const deltaFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatDeltaPercent(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${deltaFormatter.format(value)}%`;
}

function resolveDeltaText(current: number, previous: number | null): string {
  if (previous === null || previous === 0) {
    return "Variação: —";
  }

  const deltaPercent = ((current - previous) / Math.abs(previous)) * 100;
  return `Variação: ${formatDeltaPercent(deltaPercent)}`;
}

export function NetWorthComparisonTooltip({
  active,
  payload,
  label
}: NetWorthComparisonTooltipProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const currentEntry = payload.find((entry) => entry.dataKey === "net") ?? payload[0];
  const chartPayload = currentEntry?.payload;
  if (!chartPayload) {
    return null;
  }

  const currentValue = Number.isFinite(chartPayload.net) ? chartPayload.net : 0;
  const previousValue =
    chartPayload.previousNet !== null && Number.isFinite(chartPayload.previousNet)
      ? chartPayload.previousNet
      : null;
  const dateLabel = typeof label === "string" ? formatDateLong(label) : String(label ?? "");

  return (
    <div className="min-w-[14rem] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
      <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{dateLabel}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Patrimônio</span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {formatBRL(currentValue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Período anterior</span>
          <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">
            {previousValue === null ? "—" : formatBRL(previousValue)}
          </span>
        </div>
        <p className="pt-1 text-slate-500 dark:text-slate-400">{resolveDeltaText(currentValue, previousValue)}</p>
      </div>
    </div>
  );
}
