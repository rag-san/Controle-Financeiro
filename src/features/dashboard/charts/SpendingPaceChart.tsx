"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import { formatBRL } from "@/src/utils/format";

export type SpendingPacePoint = {
  day: number;
  current: number;
  previous: number;
};

type SpendingPaceChartProps = {
  data: SpendingPacePoint[];
  currentLabel: string;
  previousLabel: string;
  compareUntilDay?: number;
};

type SpendingPaceTooltipProps = Partial<TooltipContentProps<number, string>> & {
  currentLabel: string;
  previousLabel: string;
};

const axisCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function formatCurrencyTick(value: number): string {
  if (!Number.isFinite(value)) {
    return axisCurrencyFormatter.format(0);
  }

  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return axisCurrencyFormatter.format(normalized);
}

function payloadValue(payload: TooltipPayloadEntry<number, string>[] | undefined, key: "current" | "previous"): number {
  if (!payload || payload.length === 0) return 0;
  const match = payload.find((entry) => entry.dataKey === key);
  return typeof match?.value === "number" && Number.isFinite(match.value) ? match.value : 0;
}

function SpendingPaceTooltip({
  active,
  payload,
  label,
  currentLabel,
  previousLabel
}: SpendingPaceTooltipProps): React.JSX.Element | null {
  const typedPayload = payload as TooltipPayloadEntry<number, string>[] | undefined;
  if (!active || !typedPayload || typedPayload.length === 0) return null;

  const current = payloadValue(typedPayload, "current");
  const previous = payloadValue(typedPayload, "previous");
  const difference = current - previous;
  const differencePrefix = difference > 0 ? "+" : difference < 0 ? "-" : "";

  return (
    <div className="min-w-[196px] rounded-xl border border-slate-700/80 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Dia {label ?? "--"}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">Atual</span>
          <span className="font-semibold text-cyan-300">{formatBRL(current)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">Anterior</span>
          <span className="font-semibold text-slate-200">{formatBRL(previous)}</span>
        </div>
        <div className="mt-1 h-px bg-slate-800" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">Diferença</span>
          <span className="font-semibold text-emerald-300">{`${differencePrefix}${formatBRL(Math.abs(difference))}`}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{currentLabel}</span>
        <span>{previousLabel}</span>
      </div>
    </div>
  );
}

export function SpendingPaceChart({
  data,
  currentLabel,
  previousLabel,
  compareUntilDay
}: SpendingPaceChartProps): React.JSX.Element {
  const lastDay = compareUntilDay ?? data[data.length - 1]?.day ?? 1;

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 6, bottom: 10 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 6" strokeOpacity={0.2} />
          <XAxis
            dataKey="day"
            tickFormatter={(value) => String(value)}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tickMargin={9}
            minTickGap={18}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(value) => formatCurrencyTick(Number(value))}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            width={88}
          />
          <Tooltip
            cursor={{
              stroke: "hsl(var(--muted-foreground))",
              strokeDasharray: "3 6",
              strokeOpacity: 0.28,
              strokeWidth: 1
            }}
            content={<SpendingPaceTooltip currentLabel={currentLabel} previousLabel={previousLabel} />}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="plainline"
            wrapperStyle={{ paddingTop: 12, fontSize: "12px" }}
          />
          <Line
            type="linear"
            dataKey="previous"
            name={previousLabel}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.6}
            strokeDasharray="6 6"
            strokeOpacity={0.55}
            dot={false}
            activeDot={{
              r: 3.5,
              strokeWidth: 2,
              stroke: "hsl(var(--background))",
              fill: "hsl(var(--muted-foreground))"
            }}
          />
          <Line
            type="linear"
            dataKey="current"
            name={currentLabel}
            stroke="hsl(var(--primary))"
            strokeWidth={2.2}
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: "hsl(var(--background))",
              fill: "hsl(var(--primary))"
            }}
          />
          <ReferenceLine
            x={lastDay}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 6"
            strokeOpacity={0.34}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
