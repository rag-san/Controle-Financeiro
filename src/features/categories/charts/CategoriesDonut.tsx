"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryDonutSlice } from "@/src/features/categories/utils/categoryAggregates";
import { formatBRL } from "@/src/utils/format";

type CategoriesDonutProps = {
  slices: CategoryDonutSlice[];
};

function DonutTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload?: CategoryDonutSlice }>;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg dark:border-border dark:bg-secondary/60">
      <p className="font-medium text-foreground">{item.label}</p>
      <p className="tabular-nums font-semibold text-foreground">{formatBRL(item.value)}</p>
      <p className="text-muted-foreground">{item.percentage.toFixed(1)}%</p>
    </div>
  );
}

export function CategoriesDonut({ slices }: CategoriesDonutProps): React.JSX.Element {
  const data =
    slices.length > 0
      ? slices
      : [
          {
            id: "empty",
            label: "Sem gastos",
            color: "#cbd5e1",
            value: 1,
            percentage: 100
          } satisfies CategoryDonutSlice
        ];

  return (
    <div className="h-52 w-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<DonutTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="72%"
            outerRadius="94%"
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={true}
            animationDuration={350}
          >
            {data.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}


