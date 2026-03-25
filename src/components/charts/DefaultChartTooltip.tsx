"use client";

import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import { formatBRL } from "@/src/utils/format";

type TooltipPayloadItem = TooltipPayloadEntry<number, string>;

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getSeriesLabel(item: TooltipPayloadItem): string {
  if (typeof item.name === "string" && item.name.length > 0) return item.name;
  if (typeof item.dataKey === "string" && item.dataKey.length > 0) return item.dataKey;
  if (typeof item.dataKey === "number") return String(item.dataKey);
  return "Serie";
}

type DefaultChartTooltipProps = Partial<TooltipContentProps<number, string>> & {
  titleFormatter?: (label: string | number | undefined) => string;
};

export function DefaultChartTooltip({
  active,
  payload,
  label,
  titleFormatter
}: DefaultChartTooltipProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const normalizedItems = payload
    .map((item) => {
      const numericValue = toNumericValue(item.value);
      if (numericValue === null) return null;

      return {
        label: getSeriesLabel(item),
        color: item.color ?? item.fill ?? item.stroke ?? "hsl(var(--foreground))",
        value: numericValue
      };
    })
    .filter((item): item is { label: string; color: string; value: number } => item !== null);

  if (normalizedItems.length === 0) return null;

  const title = titleFormatter ? titleFormatter(label) : label !== undefined ? String(label) : "";

  return (
    <div className="min-w-[12rem] rounded-2xl border border-border/90 bg-card/95 p-3 text-sm shadow-[0_18px_42px_hsl(var(--overlay)/0.18)] backdrop-blur">
      {title ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p> : null}
      <ul className="space-y-2">
        {normalizedItems.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-border/60"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="truncate text-[13px] text-foreground/90">{item.label}</span>
            </div>
            <span className="font-semibold text-foreground">{formatBRL(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
