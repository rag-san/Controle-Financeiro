"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { Card } from "@/src/components/ui/Card";
import type { ReportsTimeSeriesPoint } from "@/src/features/reports/types";
import { formatBRL, formatBRLCompact } from "@/src/utils/format";

type IncomeVsExpensesChartCardProps = {
  data: ReportsTimeSeriesPoint[];
};

type ChartDatum = {
  label: string;
  income: number;
  expense: number;
  net: number;
};

function resolveXAxisInterval(pointsLength: number): number {
  if (pointsLength <= 6) return 0;
  if (pointsLength <= 12) return 1;
  return Math.max(1, Math.ceil(pointsLength / 8) - 1);
}

function TrendTooltip({
  active,
  payload,
  label
}: Partial<TooltipContentProps<number, string>>): React.JSX.Element | null {
  const items = payload ?? [];
  if (!active || items.length === 0) return null;

  const income = typeof items.find((item) => item.dataKey === "income")?.value === "number"
    ? Number(items.find((item) => item.dataKey === "income")?.value)
    : 0;
  const expense = typeof items.find((item) => item.dataKey === "expense")?.value === "number"
    ? Number(items.find((item) => item.dataKey === "expense")?.value)
    : 0;
  const net = income - expense;

  return (
    <div className="min-w-[12rem] rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{String(label ?? "")}</p>
      <div className="mt-1 space-y-1 text-xs">
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Receitas</span>
          <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatBRL(income)}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Despesas</span>
          <span className="tabular-nums font-semibold text-rose-600 dark:text-rose-400">{formatBRL(expense)}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">Saldo</span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatBRL(net)}</span>
        </p>
      </div>
    </div>
  );
}

export function IncomeVsExpensesChartCard({ data }: IncomeVsExpensesChartCardProps): React.JSX.Element {
  const chartData: ChartDatum[] = data.map((point) => ({
    label: point.label,
    income: point.income,
    expense: point.expense,
    net: point.net
  }));
  const xAxisInterval = resolveXAxisInterval(chartData.length);

  return (
    <Card className="p-4">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Receitas x Despesas
      </h3>

      {chartData.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Sem histórico suficiente para este período.
        </p>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
              <XAxis
                dataKey="label"
                interval={xAxisInterval}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={10}
              />
              <YAxis
                tickFormatter={(value) => formatBRLCompact(Number(value))}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={84}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend verticalAlign="bottom" align="left" iconType="line" wrapperStyle={{ paddingTop: 10 }} />
              <Line type="monotone" dataKey="income" name="Receitas" stroke="#10b981" strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="expense" name="Despesas" stroke="#f43f5e" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

