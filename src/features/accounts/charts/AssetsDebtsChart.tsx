"use client";

import { Clock3 } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { AssetsDebtsTooltip } from "@/src/components/charts/AssetsDebtsTooltip";
import { Skeleton } from "@/src/components/ui/Skeleton";
import type {
  AccountsRangeKey,
  AssetsDebtsPoint,
  HoverPoint
} from "@/src/features/accounts/types";
import { makeNiceYAxis } from "@/src/features/accounts/utils/niceTicks";
import { formatBRL, formatShortDate } from "@/src/utils/format";

type AssetsDebtsChartProps = {
  data: AssetsDebtsPoint[];
  range: AccountsRangeKey;
  loading?: boolean;
  a11ySummary: string;
  onHoverPointChange?: (point: HoverPoint) => void;
};

function resolveXAxisInterval(range: AccountsRangeKey, pointsLength: number): number {
  if (pointsLength <= 1) return 0;

  if (range === "1W") {
    return 0;
  }

  if (range === "1M") {
    return Math.max(0, Math.ceil(pointsLength / 7) - 1);
  }

  if (range === "3M") {
    if (pointsLength <= 14) {
      return 0;
    }
    return Math.max(0, Math.ceil(pointsLength / 12) - 1);
  }

  if (range === "1Y" || range === "ALL") {
    if (pointsLength <= 14) {
      return 0;
    }
    return Math.max(0, Math.ceil(pointsLength / 12) - 1);
  }

  if (pointsLength <= 14) {
    return 0;
  }

  return Math.max(0, Math.ceil(pointsLength / 10) - 1);
}

function resolveHoverPointFromChartState(state: unknown): HoverPoint {
  if (!state || typeof state !== "object") {
    return null;
  }

  const activePayload = (state as { activePayload?: Array<{ payload?: AssetsDebtsPoint }> }).activePayload;
  const point = activePayload?.[0]?.payload;

  if (!point || typeof point.date !== "string") {
    return null;
  }

  return {
    date: point.date,
    assets: Number.isFinite(point.assets) ? Math.max(0, point.assets) : 0,
    debts: Number.isFinite(point.debts) ? Math.max(0, point.debts) : 0
  };
}

export function AssetsDebtsChart({
  data,
  range,
  loading = false,
  a11ySummary,
  onHoverPointChange
}: AssetsDebtsChartProps): React.JSX.Element {
  const normalizedData = data.map((item) => ({
    ...item,
    assets: Math.max(0, item.assets),
    debts: Math.max(0, item.debts)
  }));

  const yAxis = makeNiceYAxis(
    normalizedData.flatMap((item) => [item.assets, item.debts]),
    5
  );
  const xAxisInterval = resolveXAxisInterval(range, normalizedData.length);

  if (loading) {
    return <Skeleton className="h-[250px] rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div
        className="flex h-[250px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        <p>Dados disponíveis após 7 dias</p>
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <p className="sr-only">{a11ySummary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          key={`assets-debts-${range}`}
          data={normalizedData}
          margin={{ top: 12, right: 16, left: 8, bottom: 0 }}
          onMouseMove={(state) => onHoverPointChange?.(resolveHoverPointFromChartState(state))}
          onMouseLeave={() => onHoverPointChange?.(null)}
        >
          <defs>
            <linearGradient id="accountsAssetsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b7ddb" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#5b7ddb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.12} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            interval={xAxisInterval}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={14}
          />
          <YAxis
            tickFormatter={(value) => formatBRL(Number(value))}
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={96}
          />
          <Tooltip content={<AssetsDebtsTooltip />} />
          <Area
            type="monotone"
            dataKey="assets"
            name="Ativos"
            stroke="#5b7ddb"
            strokeWidth={2.2}
            fill="url(#accountsAssetsFill)"
            dot={false}
            activeDot={{ r: 4, fill: "#5b7ddb", strokeWidth: 0 }}
            isAnimationActive={true}
            animationDuration={350}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="debts"
            name="Dívidas"
            stroke="#f08c45"
            strokeWidth={2.1}
            dot={false}
            activeDot={{ r: 4, fill: "#f08c45", strokeWidth: 0 }}
            isAnimationActive={true}
            animationDuration={350}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
