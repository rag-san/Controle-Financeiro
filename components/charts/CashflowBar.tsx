"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";

type CashflowPoint = {
  month: string;
  income: number;
  expense: number;
  balance: number;
};

export function CashflowBar({ data }: { data: CashflowPoint[] }): React.JSX.Element {
  return (
    <ChartFrame className="h-72" minHeight={280}>
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="income" name="Receitas" fill="#22c55e" radius={[6, 6, 0, 0]} />
          <Bar dataKey="expense" name="Despesas" fill="#ef4444" radius={[6, 6, 0, 0]} />
          <Bar dataKey="balance" name="Saldo" fill="#3b82f6" radius={[6, 6, 0, 0]} />
        </BarChart>
      )}
    </ChartFrame>
  );
}


