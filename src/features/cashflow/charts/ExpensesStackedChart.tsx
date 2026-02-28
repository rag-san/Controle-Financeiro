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
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
      {categories.map((category) => (
        <li key={category} className="flex max-w-[150px] items-center gap-1.5">
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
    return <Skeleton className="h-[250px] rounded-xl" />;
  }

  if (data.rows.length === 0 || data.categories.length === 0) {
    return (
      <div className="flex h-[250px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/70 bg-slate-900/20 text-sm text-slate-400">
        <AlertCircle className="h-4 w-4" />
        <p>Sem despesas neste período.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="sr-only">{a11ySummary}</p>
      <CompactLegend categories={data.legendCategories} />
      <div className="h-[250px] w-full overflow-x-auto">
        <div className="h-full min-w-[460px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.rows}
              margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
              barCategoryGap="35%"
              barGap={4}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(59,130,246,0.16)" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthLabel}
                tick={{ fontSize: 11, fill: "#5f7aa3" }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={formatBRLCompact}
                tick={{ fontSize: 11, fill: "#5f7aa3" }}
                tickLine={false}
                axisLine={false}
                width={78}
              />
              <Tooltip content={<ExpensesStackedTooltip />} cursor={{ fill: "rgba(59,130,246,0.1)" }} />
              <Legend content={() => null} />
              {data.categories.map((category) => (
                <Bar
                  key={category}
                  dataKey={category}
                  stackId="expenses"
                  fill={getCategoryColor(category)}
                  name={category}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
