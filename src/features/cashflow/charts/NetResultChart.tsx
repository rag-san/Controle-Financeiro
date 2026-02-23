"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { DefaultChartTooltip } from "@/src/components/charts/DefaultChartTooltip";
import type { NetResultRow } from "@/src/features/cashflow/types";
import { formatBRLCompact, formatMonthLabel } from "@/src/utils/format";

type NetResultChartProps = {
  data: NetResultRow[];
  a11ySummary: string;
  loading?: boolean;
};

function resolveDomainMax(data: NetResultRow[]): number {
  const maxAbsolute = data.reduce((accumulator, item) => {
    const previousAbs = typeof item.previousNet === "number" ? Math.abs(item.previousNet) : 0;
    const valueAbs = Math.abs(item.net);
    return Math.max(accumulator, valueAbs, previousAbs);
  }, 0);

  if (maxAbsolute === 0) {
    return 100;
  }

  const padded = maxAbsolute * 1.15;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(padded)) - 1);
  return Math.ceil(padded / magnitude) * magnitude;
}

function formatTooltipMonth(label: string | number | undefined): string {
  if (typeof label === "string") {
    return formatMonthLabel(label);
  }

  if (typeof label === "number") {
    return String(label);
  }

  return "";
}

function resolveXAxisInterval(pointsLength: number): number {
  if (pointsLength <= 6) return 0;
  if (pointsLength <= 12) return 1;
  return Math.max(1, Math.ceil(pointsLength / 8) - 1);
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

  const hasPreviousNet = chartData.some((entry) => typeof entry.previousNet === "number");

  if (loading) {
    return <Skeleton className="h-[260px] rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Sem dados no período selecionado.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <p className="sr-only">{a11ySummary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.14} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            interval={xAxisInterval}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={12}
          />
          <YAxis
            tickFormatter={formatBRLCompact}
            domain={yDomain}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={84}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.4} />
          <Tooltip content={<DefaultChartTooltip titleFormatter={formatTooltipMonth} />} />
          <Bar
            dataKey="net"
            name="Resultado líquido"
            fill="#66bb6a"
            maxBarSize={34}
            radius={[8, 8, 8, 8]}
          >
            {chartData.map((entry) => (
              <Cell key={entry.month} fill={entry.net >= 0 ? "#66bb6a" : "#ef5350"} />
            ))}
          </Bar>
          {hasPreviousNet ? (
            <Line
              type="monotone"
              dataKey="previousNet"
              name="Período anterior"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
