"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";

type TrendPoint = {
  day: number;
  current: number;
  previous: number;
};

export function SpendingTrend({ data }: { data: TrendPoint[] }): React.JSX.Element {
  return (
    <ChartFrame className="h-72" minHeight={280}>
      {({ width, height }) => (
        <LineChart width={width} height={height} data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="current" name="Mes atual" stroke="#f97316" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="previous" name="Mes anterior" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 4" />
        </LineChart>
      )}
    </ChartFrame>
  );
}


