"use client";

import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import { formatBRL, formatDateLong } from "@/src/utils/format";

type TooltipPayloadItem = TooltipPayloadEntry<number, string>;

type AssetsDebtsTooltipProps = Partial<TooltipContentProps<number, string>>;

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function resolveTooltipValues(payload: TooltipPayloadItem[]): { assets: number; debts: number } {
  let assets = 0;
  let debts = 0;

  for (const item of payload) {
    const value = toNumericValue(item.value);
    if (value === null) continue;

    const dataKey =
      typeof item.dataKey === "string"
        ? item.dataKey
        : typeof item.name === "string"
          ? item.name.toLowerCase()
          : "";

    if (dataKey === "assets" || dataKey.includes("ativo")) {
      assets = value;
      continue;
    }

    if (dataKey === "debts" || dataKey.includes("divid")) {
      debts = value;
    }
  }

  return { assets, debts };
}

export function AssetsDebtsTooltip({
  active,
  payload,
  label
}: AssetsDebtsTooltipProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const values = resolveTooltipValues(payload as TooltipPayloadItem[]);
  const title = typeof label === "string" ? formatDateLong(label) : "";

  return (
    <div className="min-w-[13rem] rounded-xl border border-border bg-card p-3 text-sm shadow-xl">
      {title ? <p className="mb-2 font-semibold text-foreground">{title}</p> : null}

      <ul className="space-y-1.5">
        <li className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#5b7ddb]" aria-hidden="true" />
            <span className="text-muted-foreground">Ativos</span>
          </div>
          <span className="font-semibold text-foreground">{formatBRL(values.assets)}</span>
        </li>
        <li className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f08c45]" aria-hidden="true" />
            <span className="text-muted-foreground">Dívidas</span>
          </div>
          <span className="font-semibold text-foreground">{formatBRL(values.debts)}</span>
        </li>
      </ul>
    </div>
  );
}
