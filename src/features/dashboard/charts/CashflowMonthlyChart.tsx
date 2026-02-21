"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { DefaultChartTooltip } from "@/src/components/charts/DefaultChartTooltip";
import { formatBRL, formatMonthLabel } from "@/src/utils/format";

type CashflowPoint = {
  month: string;
  income: number;
  expense: number;
  balance: number;
};

type CashflowMonthlyChartProps = {
  data: CashflowPoint[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function getNiceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) return 100;

  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;

  if (residual <= 1) return magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function aggregateMonthlyCashflow(items: CashflowPoint[]): CashflowPoint[] {
  const monthMap = new Map<string, { month: string; income: number; expense: number }>();

  for (const item of items) {
    const month = item.month;
    const income = Math.abs(item.income);
    const expense = item.expense > 0 ? -item.expense : item.expense;
    const current = monthMap.get(month) ?? { month, income: 0, expense: 0 };

    current.income += income;
    current.expense += expense;
    monthMap.set(month, current);
  }

  return [...monthMap.values()]
    .sort((a, b) => (a.month > b.month ? 1 : -1))
    .map((item) => {
      const income = round2(item.income);
      const expense = round2(item.expense);
      return {
        month: item.month,
        income,
        expense,
        balance: round2(income + expense)
      };
    });
}

function getXAxisInterval(totalMonths: number): number {
  if (totalMonths <= 6) return 0;
  if (totalMonths <= 10) return 1;
  return 2;
}

export function CashflowMonthlyChart({ data }: CashflowMonthlyChartProps): React.JSX.Element {
  const aggregatedData = useMemo(() => aggregateMonthlyCashflow(data), [data]);
  const xAxisInterval = useMemo(() => getXAxisInterval(aggregatedData.length), [aggregatedData.length]);
  const chartMinWidth = useMemo(() => Math.max(560, aggregatedData.length * 96), [aggregatedData.length]);

  const chartScale = useMemo(() => {
    const values = aggregatedData.flatMap((item) => [item.income, item.expense, item.balance, 0]);
    const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);
    const step = getNiceStep(maxAbs / 3);
    const domainLimit = step * Math.ceil(maxAbs / step);

    const ticks: number[] = [];
    for (let tick = -domainLimit; tick <= domainLimit; tick += step) {
      ticks.push(round2(tick));
    }

    return {
      yDomain: [-domainLimit, domainLimit] as [number, number],
      yTicks: ticks
    };
  }, [aggregatedData]);

  return (
    <div className="h-[320px] w-full overflow-x-auto">
      <div className="h-full" style={{ minWidth: `${chartMinWidth}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={aggregatedData}
            margin={{ top: 12, right: 10, left: 10, bottom: 4 }}
            barCategoryGap="28%"
            barGap={6}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.12} />
            <XAxis
              dataKey="month"
              interval={xAxisInterval}
              minTickGap={20}
              tickMargin={8}
              tickFormatter={formatMonthLabel}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={chartScale.yDomain}
              ticks={chartScale.yTicks}
              tickFormatter={formatBRL}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={112}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.4} />
            <Tooltip content={<DefaultChartTooltip titleFormatter={(label) => formatMonthLabel(String(label ?? ""))} />} />
            <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 8 }} />
            <Bar dataKey="income" name="Receitas" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={16} />
            <Bar dataKey="expense" name="Despesas" fill="#ef4444" radius={[0, 0, 6, 6]} maxBarSize={16} />
            <Line
              type="monotone"
              dataKey="balance"
              name="Saldo"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
