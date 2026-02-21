"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/src/utils/format";

type RecurringProgressRingProps = {
  paid: number;
  remaining: number;
};

type RingDatum = {
  name: string;
  value: number;
  color: string;
};

function RingTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload?: RingDatum }>;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="font-medium text-slate-700 dark:text-slate-200">{item.name}</p>
      <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
        {formatBRL(item.value)}
      </p>
    </div>
  );
}

export function RecurringProgressRing({
  paid,
  remaining
}: RecurringProgressRingProps): React.JSX.Element {
  const safePaid = Math.max(0, paid);
  const safeRemaining = Math.max(0, remaining);
  const total = safePaid + safeRemaining;

  const data: RingDatum[] =
    total <= 0
      ? [
          { name: "Sem dados", value: 1, color: "#cbd5e1" }
        ]
      : [
          { name: "Pago", value: safePaid, color: "#3b82f6" },
          { name: "Faltante", value: safeRemaining, color: "#e2e8f0" }
        ];

  return (
    <div className="relative h-44 w-44" aria-label="Progresso de pagamentos recorrentes">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<RingTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="70%"
            outerRadius="92%"
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={true}
            animationDuration={350}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pago</p>
          <p className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
            {total > 0 ? `${Math.round((safePaid / total) * 100)}%` : "0%"}
          </p>
        </div>
      </div>
    </div>
  );
}
