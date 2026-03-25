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
    <div className="min-w-[12rem] rounded-2xl border border-border/90 bg-card/95 p-3 text-sm shadow-[0_18px_42px_hsl(var(--overlay)/0.18)] backdrop-blur">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{String(label ?? "")}</p>
      <div className="mt-1 space-y-1 text-xs">
        <p className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-foreground/90">Receitas</span>
          <span className="tabular-nums font-semibold text-success">{formatBRL(income)}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-foreground/90">Despesas</span>
          <span className="tabular-nums font-semibold text-error">{formatBRL(expense)}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-foreground/90">Saldo</span>
          <span className="tabular-nums font-semibold text-foreground">{formatBRL(net)}</span>
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
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Receitas x Despesas
      </h3>

      {chartData.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-sm text-muted-foreground dark:border-border dark:text-muted-foreground/80">
          Sem histórico suficiente para este período.
        </p>
      ) : (
        <div className="h-[240px] w-full sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.22)" />
              <XAxis
                dataKey="label"
                interval={xAxisInterval}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={10}
              />
              <YAxis
                tickFormatter={(value) => formatBRLCompact(Number(value))}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={84}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend verticalAlign="bottom" align="left" iconType="line" wrapperStyle={{ paddingTop: 10, color: "hsl(var(--muted-foreground))" }} />
              <Line type="monotone" dataKey="income" name="Receitas" stroke="hsl(var(--success))" strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="expense" name="Despesas" stroke="hsl(var(--error))" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}



