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
    <div className="rounded-2xl border border-border/90 bg-card/95 px-3 py-2 text-xs shadow-[0_18px_42px_hsl(var(--overlay)/0.18)] backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.name}</p>
      <p className="tabular-nums font-semibold text-foreground">
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
          { name: "Sem dados", value: 1, color: "hsl(var(--muted-foreground) / 0.35)" }
        ]
      : [
          { name: "Pago", value: safePaid, color: "hsl(var(--success))" },
          { name: "Faltante", value: safeRemaining, color: "hsl(var(--muted-foreground) / 0.28)" }
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
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pago</p>
          <p className="tabular-nums text-sm font-semibold text-foreground">
            {total > 0 ? `${Math.round((safePaid / total) * 100)}%` : "0%"}
          </p>
        </div>
      </div>
    </div>
  );
}


