"use client";

import {
  Bar,
  BarChart,
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

export function IncomeChart({
  data,
  a11ySummary,
  loading = false
}: IncomeChartProps): React.JSX.Element {
  const yDomainUpper = resolveUpperDomain(data);

  if (loading) {
    return <Skeleton className="h-[220px] rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Sem dados de receitas no período selecionado.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <p className="sr-only">{a11ySummary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          barCategoryGap="35%"
          barGap={6}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.14} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
          />
          <YAxis
            tickFormatter={formatBRLCompact}
            domain={[0, yDomainUpper]}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={84}
          />
          <Tooltip content={<DefaultChartTooltip titleFormatter={formatTooltipMonth} />} />
          <Bar
            dataKey="income"
            name="Receitas"
            fill="#5b7ddb"
            radius={[8, 8, 0, 0]}
            maxBarSize={38}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
