"use client";

import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import type { CategoryDonutSlice } from "@/src/features/categories/utils/categoryAggregates";
import { formatBRL } from "@/src/utils/format";

type CategoriesDonutProps = {
  slices: CategoryDonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  className?: string;
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

export function CategoriesDonut({
  slices,
  centerLabel = "GASTOS",
  centerValue,
  className
}: CategoriesDonutProps): React.JSX.Element {
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
  const donut = (
    <>
      <Tooltip content={<DonutTooltip />} />
      <Pie
        data={data}
        dataKey="value"
        nameKey="label"
        innerRadius="66%"
        outerRadius="86%"
        stroke="hsl(var(--card))"
        strokeWidth={2}
        paddingAngle={1}
        cornerRadius={2}
        startAngle={90}
        endAngle={-270}
        isAnimationActive={true}
        animationDuration={350}
      >
        {data.map((slice) => (
          <Cell key={slice.id} fill={slice.color} />
        ))}
      </Pie>
    </>
  );

  return (
    <div className={cn("relative h-60 w-60", className)}>
      {typeof window === "undefined" ? (
        <PieChart width={240} height={240}>
          <Tooltip content={<DonutTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={78}
            outerRadius={103}
            stroke="hsl(var(--card))"
            strokeWidth={2}
            paddingAngle={1}
            cornerRadius={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {data.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      ) : (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <PieChart>{donut}</PieChart>
        </ResponsiveContainer>
      )}

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex max-w-[8rem] flex-col items-center text-center">
          <span className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {centerLabel}
          </span>
          {centerValue ? (
            <span className="mt-1 text-sm font-black tracking-tight text-slate-900 dark:text-slate-100">
              {centerValue}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}


