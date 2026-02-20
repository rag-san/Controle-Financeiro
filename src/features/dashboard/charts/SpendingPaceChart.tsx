"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { DefaultChartTooltip } from "@/src/components/charts/DefaultChartTooltip";
import { formatBRLCompact } from "@/src/utils/format";

export type SpendingPacePoint = {
  day: number;
  current: number;
  previous: number;
};

type SpendingPaceChartProps = {
  data: SpendingPacePoint[];
  currentLabel: string;
  previousLabel: string;
  markerLabel?: string;
};

type MarkerBubbleProps = {
  x?: number;
  y?: number;
  value?: string;
};

function MarkerBubble({ x = 0, y = 0, value = "" }: MarkerBubbleProps): React.JSX.Element {
  const label = value.length > 0 ? value : "";
  const width = Math.max(96, label.length * 7 + 18);
  const left = x - width / 2;

  return (
    <g>
      <rect
        x={left}
        y={y - 36}
        width={width}
        height={24}
        rx={8}
        ry={8}
        fill="#f59e0b"
        stroke="#d97706"
        strokeWidth={1}
      />
      <text x={x} y={y - 20} textAnchor="middle" fill="#ffffff" fontSize={12} fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

function getWeeklyTicks(data: SpendingPacePoint[]): number[] {
  if (data.length === 0) return [];

  const firstDay = data[0].day;
  const lastDay = data[data.length - 1].day;
  const ticks = [firstDay];

  for (let day = firstDay + 7; day < lastDay; day += 7) {
    ticks.push(day);
  }

  if (ticks[ticks.length - 1] !== lastDay) {
    ticks.push(lastDay);
  }

  return ticks;
}

function getMarkerPoint(data: SpendingPacePoint[]): SpendingPacePoint | null {
  if (data.length === 0) return null;

  for (let index = data.length - 1; index >= 0; index -= 1) {
    const point = data[index];
    if (point.current > 0 || point.previous > 0) {
      return point;
    }
  }

  return data[data.length - 1] ?? null;
}

export function SpendingPaceChart({
  data,
  currentLabel,
  previousLabel,
  markerLabel
}: SpendingPaceChartProps): React.JSX.Element {
  const markerPoint = getMarkerPoint(data);
  const dayTicks = getWeeklyTicks(data);

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" strokeOpacity={0.18} />
          <XAxis
            dataKey="day"
            ticks={dayTicks}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickFormatter={formatBRLCompact}
            tickLine={false}
            axisLine={false}
            width={82}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip content={<DefaultChartTooltip titleFormatter={(value) => `Dia ${value ?? ""}`.trim()} />} />
          <Legend verticalAlign="bottom" align="left" iconType="line" wrapperStyle={{ paddingTop: 14 }} />
          <Line
            type="monotone"
            dataKey="previous"
            name={previousLabel}
            stroke="#94a3b8"
            strokeWidth={2.1}
            strokeDasharray="6 6"
            strokeOpacity={0.95}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="#f59e0b"
            strokeWidth={2.6}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {markerPoint ? (
            <>
              <ReferenceLine x={markerPoint.day} stroke="#86efac" strokeDasharray="3 3" strokeOpacity={0.6} />
              <ReferenceDot
                x={markerPoint.day}
                y={markerPoint.current}
                r={6}
                fill="#22c55e"
                stroke="#ffffff"
                strokeWidth={2}
                label={<MarkerBubble value={markerLabel} />}
              />
            </>
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
