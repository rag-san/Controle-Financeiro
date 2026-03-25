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
    <div className="min-w-[14rem] rounded-2xl border border-border/90 bg-card/95 p-3 text-xs shadow-[0_18px_42px_hsl(var(--overlay)/0.18)] backdrop-blur">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{dateLabel}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-foreground/90">Patrimônio</span>
          <span className="tabular-nums font-semibold text-foreground">
            {formatBRL(currentValue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-foreground/90">Período anterior</span>
          <span className="tabular-nums font-medium text-foreground">
            {previousValue === null ? "—" : formatBRL(previousValue)}
          </span>
        </div>
        <p className="pt-1 text-muted-foreground">{resolveDeltaText(currentValue, previousValue)}</p>
      </div>
    </div>
  );
}


