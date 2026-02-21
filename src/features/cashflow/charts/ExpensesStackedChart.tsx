"use client";

import { AlertCircle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpensesStackedTooltip } from "@/src/components/charts/ExpensesStackedTooltip";
import { getCategoryColor } from "@/src/features/categories/categoryColors";
import type { ExpensesStackedChartData } from "@/src/features/cashflow/types";
import { formatBRLCompact, formatMonthLabel } from "@/src/utils/format";

type ExpensesStackedChartProps = {
  data: ExpensesStackedChartData;
  a11ySummary: string;
  loading?: boolean;
};

function CompactLegend({
  categories
}: {
  categories: string[];
}): React.JSX.Element {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      {categories.map((category) => (
        <li key={category} className="flex max-w-[130px] items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: getCategoryColor(category) }}
            aria-hidden="true"
          />
          <span className="truncate" title={category}>
            {category}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ExpensesStackedChart({
  data,
  a11ySummary,
  loading = false
}: ExpensesStackedChartProps): React.JSX.Element {
  if (loading) {
    return <Skeleton className="h-[240px] rounded-xl" />;
  }

  if (data.rows.length === 0 || data.categories.length === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <p>No expenses in this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="sr-only">{a11ySummary}</p>
      <CompactLegend categories={data.legendCategories} />
      <div className="h-[240px] w-full overflow-x-auto">
        <div className="h-full min-w-[480px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.rows}
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
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={84}
              />
              <Tooltip content={<ExpensesStackedTooltip />} />
              <Legend content={() => null} />
              {data.categories.map((category) => (
                <Bar
                  key={category}
                  dataKey={category}
                  stackId="expenses"
                  fill={getCategoryColor(category)}
                  name={category}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={38}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
