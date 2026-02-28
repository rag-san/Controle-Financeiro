"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { DefaultChartTooltip } from "@/src/components/charts/DefaultChartTooltip";
import type { IncomeRow } from "@/src/features/cashflow/types";
import { formatBRLCompact, formatMonthLabel } from "@/src/utils/format";

type IncomeChartProps = {
  data: IncomeRow[];
  a11ySummary: string;
  loading?: boolean;
};

function resolveUpperDomain(data: IncomeRow[]): number {
  const maxIncome = data.reduce((max, item) => Math.max(max, item.income), 0);

  if (maxIncome === 0) {
    return 100;
  }

  const padded = maxIncome * 1.15;
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

export function IncomeChart({
  data,
  a11ySummary,
  loading = false
}: IncomeChartProps): React.JSX.Element {
  const yDomainUpper = resolveUpperDomain(data);
  const xAxisInterval = resolveXAxisInterval(data.length);

  if (loading) {
    return <Skeleton className="h-[230px] rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[230px] items-center justify-center text-sm text-muted-foreground">
        Sem dados de receitas no período selecionado.
      </div>
    );
  }

  return (
    <div className="h-[230px] w-full">
      <p className="sr-only">{a11ySummary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cashflow-income-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(59,130,246,0.16)" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            interval={xAxisInterval}
            tick={{ fontSize: 10, fill: "#5f7aa3" }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={12}
          />
          <YAxis
            tickFormatter={formatBRLCompact}
            domain={[0, yDomainUpper]}
            tick={{ fontSize: 10, fill: "#5f7aa3" }}
            tickLine={false}
            axisLine={false}
            width={76}
          />
          <Tooltip content={<DefaultChartTooltip titleFormatter={formatTooltipMonth} />} />
          <Area
            type="monotone"
            dataKey="income"
            name="Receitas"
            stroke="#10b981"
            strokeWidth={2.1}
            fill="url(#cashflow-income-gradient)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
