"use client";

import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import { formatBRL, formatMonthLabel } from "@/src/utils/format";

type ExpensesTooltipPayloadItem = TooltipPayloadEntry<number, string>;

type NormalizedTooltipItem = {
  category: string;
  color: string;
  value: number;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePayload(payload: ExpensesTooltipPayloadItem[]): NormalizedTooltipItem[] {
  return payload
    .map((item) => {
      const numericValue = toNumber(item.value);
      if (numericValue === null || numericValue <= 0) return null;

      const categoryName = typeof item.dataKey === "string" ? item.dataKey : String(item.name ?? "Categoria");
      return {
        category: categoryName,
        color: item.color ?? item.fill ?? item.stroke ?? "hsl(var(--foreground))",
        value: numericValue
      };
    })
    .filter((item): item is NormalizedTooltipItem => item !== null)
    .sort((left, right) => right.value - left.value);
}

export function ExpensesStackedTooltip({
  active,
  payload,
  label
}: Partial<TooltipContentProps<number, string>>): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const items = normalizePayload(payload as ExpensesTooltipPayloadItem[]);
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const title = typeof label === "string" ? formatMonthLabel(label) : String(label ?? "");

  return (
    <div className="min-w-[14rem] rounded-xl border border-border bg-card p-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold text-foreground">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.category} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="truncate">{item.category}</span>
            </span>
            <span className="font-semibold text-foreground">{formatBRL(item.value)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-border/80 pt-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground">Total</span>
          <span className="font-semibold text-foreground">{formatBRL(total)}</span>
        </div>
      </div>
    </div>
  );
}
