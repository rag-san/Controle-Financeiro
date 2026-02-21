"use client";

import { Clock3 } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { NetWorthComparisonTooltip } from "@/src/components/charts/NetWorthComparisonTooltip";
import { Card } from "@/src/components/ui/Card";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { Skeleton } from "@/src/components/ui/Skeleton";
import type { NetWorthChartPoint, NetWorthRangeKey } from "@/src/features/networth/types";
import { makeNiceYAxis } from "@/src/features/networth/utils/niceTicks";
import { formatBRL, formatShortDate } from "@/src/utils/format";

type NetWorthHistoryChartProps = {
  data: NetWorthChartPoint[];
  range: NetWorthRangeKey;
  loading?: boolean;
  onRangeChange: (range: NetWorthRangeKey) => void;
};

const rangeOptions = [
  { label: "1D", value: "1D" },
  { label: "1W", value: "1W" },
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "YTD", value: "YTD" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" }
] as const;

function resolveXAxisInterval(range: NetWorthRangeKey, pointsLength: number): number {
  if (pointsLength <= 1) return 0;

  if (range === "1D" || range === "1W") {
    return 0;
  }

  if (range === "1M") {
    return Math.max(0, Math.ceil(pointsLength / 8) - 1);
  }

  if (range === "3M") {
    return Math.max(0, Math.ceil(pointsLength / 9) - 1);
  }

  if (range === "YTD") {
    return Math.max(0, Math.ceil(pointsLength / 10) - 1);
  }

  if (range === "1Y" || range === "ALL") {
    return pointsLength <= 12 ? 0 : Math.max(0, Math.ceil(pointsLength / 12) - 1);
  }

  return 0;
}

export function NetWorthHistoryChart({
  data,
  range,
  loading = false,
  onRangeChange
}: NetWorthHistoryChartProps): React.JSX.Element {
  const yAxis = makeNiceYAxis(
    data.flatMap((point) => [
      point.net,
      point.previousNet !== null ? point.previousNet : Number.NaN
    ]),
    5
  );
  const xAxisInterval = resolveXAxisInterval(range, data.length);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          HISTÓRICO DO PATRIMÔNIO
        </p>

        {loading ? (
          <Skeleton className="h-[228px] rounded-xl" />
        ) : data.length === 0 ? (
          <div
            className="flex h-[228px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400"
            role="status"
            aria-live="polite"
          >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            <p>Dados históricos serão exibidos após alguns dias de uso.</p>
          </div>
        ) : (
          <div className="h-[228px] w-full">
            <p className="sr-only">
              Evolução histórica do patrimônio líquido no período selecionado, com comparação ao período anterior.
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                key={`networth-history-${range}`}
                data={data}
                margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="netWorthHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b7ddb" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#5b7ddb" stopOpacity={0.01} />
                  </linearGradient>
                </defs>

                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.12} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  interval={xAxisInterval}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickMargin={10}
                  minTickGap={14}
                />
                <YAxis
                  tickFormatter={(value) => formatBRL(Number(value))}
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  tickLine={false}
                  axisLine={false}
                  width={98}
                  tick={{ fontSize: 12 }}
                />
                <ReferenceLine y={0} stroke="rgb(148 163 184 / 0.35)" strokeWidth={1} />
                <Tooltip content={<NetWorthComparisonTooltip />} />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Patrimônio"
                  stroke="#5b7ddb"
                  strokeWidth={2.2}
                  fill="url(#netWorthHistoryGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#5b7ddb", strokeWidth: 0 }}
                  isAnimationActive={true}
                  animationDuration={400}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="previousNet"
                  name="Período anterior"
                  stroke="#94a3b8"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={true}
                  animationDuration={400}
                  animationEasing="ease-out"
                  activeDot={{ r: 3, fill: "#94a3b8", strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex justify-center pt-1">
          <SegmentedControl
            options={rangeOptions}
            value={range}
            onChange={onRangeChange}
            ariaLabel="Selecionar intervalo do histórico de patrimônio"
            className="rounded-full bg-slate-100/80 p-1 dark:bg-slate-900/80"
          />
        </div>
      </div>
    </Card>
  );
}
