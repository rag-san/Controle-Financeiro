"use client";

import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { NetResultRow } from "@/src/features/cashflow/types";
import { formatBRL, formatBRLCompact, formatMonthLabel } from "@/src/utils/format";

type NetResultChartProps = {
  data: NetResultRow[];
  a11ySummary: string;
  loading?: boolean;
};

type NetTooltipPayloadItem = TooltipPayloadEntry<number, string>;

function resolveDomainMax(data: NetResultRow[]): number {
  const maxAbsolute = data.reduce((accumulator, item) => {
    const valueAbs = Math.abs(item.net);
    return Math.max(accumulator, valueAbs);
  }, 0);

  if (maxAbsolute === 0) {
    return 100;
  }

  const padded = maxAbsolute * 1.15;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(padded)) - 1);
  return Math.ceil(padded / magnitude) * magnitude;
}

function resolveXAxisInterval(pointsLength: number): number {
  if (pointsLength <= 6) return 0;
  if (pointsLength <= 12) return 1;
  return Math.max(1, Math.ceil(pointsLength / 8) - 1);
}

function NetResultTooltip({
  active,
  payload,
  label
}: Partial<TooltipContentProps<number, string>>): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const item = (payload as NetTooltipPayloadItem[]).find((entry) => entry.dataKey === "net");
  const value = typeof item?.value === "number" ? item.value : 0;
  const labelText = typeof label === "string" ? formatMonthLabel(label) : String(label ?? "");

  return (
    <div className="min-w-[12rem] rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-xl backdrop-blur">
      <p className="mb-2 font-semibold">{labelText}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-300">Resultado liquido</span>
        <span className={value >= 0 ? "font-bold text-emerald-300" : "font-bold text-rose-300"}>
          {formatBRL(value)}
        </span>
      </div>
    </div>
  );
}

export function NetResultChart({
  data,
  a11ySummary,
  loading = false
}: NetResultChartProps): React.JSX.Element {
  const chartData = data;
  const xAxisInterval = resolveXAxisInterval(chartData.length);

  const yDomain: [number, number] = (() => {
    const maxDomainValue = resolveDomainMax(chartData);
    return [-maxDomainValue, maxDomainValue];
  })();

  if (loading) {
    return <Skeleton className="h-[220px] rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Sem dados no período selecionado.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <p className="sr-only">{a11ySummary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }} barSize={44}>
          <defs>
            <linearGradient id="cashflow-net-positive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.42} />
            </linearGradient>
            <linearGradient id="cashflow-net-negative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.92} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.45} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.18} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            interval={xAxisInterval}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={12}
          />
          <YAxis
            tickFormatter={formatBRLCompact}
            domain={yDomain}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={78}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.2} strokeDasharray="4 3" />
          <Tooltip content={<NetResultTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
          <Bar dataKey="net" name="Resultado liquido" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.month}
                fill={entry.net >= 0 ? "url(#cashflow-net-positive)" : "url(#cashflow-net-negative)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
