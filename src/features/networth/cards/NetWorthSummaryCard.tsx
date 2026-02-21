import { Badge } from "@/src/components/ui/Badge";
import { Card } from "@/src/components/ui/Card";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { useAnimatedNumber } from "@/src/hooks/useAnimatedNumber";
import { formatBRL } from "@/src/utils/format";
import * as React from "react";

type NetWorthSummaryCardProps = {
  netWorth: number;
  previousNetWorth: number;
  totalAssets: number;
  totalDebts: number;
  loading?: boolean;
};

function formatDeltaPercent(value: number): string {
  const formatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatter.format(value)}%`;
}

function resolveDelta(
  current: number,
  previous: number
): { label: string; variant: "positive" | "negative" | "neutral" } {
  if (previous === 0) {
    return {
      label: "↔ N/A",
      variant: "neutral"
    };
  }

  const delta = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));

  if (delta === 0) {
    return {
      label: "→ 0,00%",
      variant: "neutral"
    };
  }

  return {
    label: `${delta > 0 ? "↑" : "↓"} ${formatDeltaPercent(delta)}`,
    variant: delta > 0 ? "positive" : "negative"
  };
}

export function NetWorthSummaryCard({
  netWorth,
  previousNetWorth,
  totalAssets,
  totalDebts,
  loading = false
}: NetWorthSummaryCardProps): React.JSX.Element {
  const animatedNetWorth = useAnimatedNumber(netWorth, { durationMs: 400 });
  const animatedAssets = useAnimatedNumber(totalAssets, { durationMs: 400 });
  const animatedDebts = useAnimatedNumber(totalDebts, { durationMs: 400 });
  const delta = resolveDelta(netWorth, previousNetWorth);
  const [deltaPulse, setDeltaPulse] = React.useState(false);

  React.useEffect(() => {
    setDeltaPulse(true);
    const timer = window.setTimeout(() => {
      setDeltaPulse(false);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delta.label, delta.variant]);

  return (
    <Card
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
      aria-busy={loading}
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-px w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            PATRIMÔNIO LÍQUIDO
          </p>
          <p className="tabular-nums whitespace-nowrap text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {formatBRL(animatedNetWorth)}
          </p>
          <Badge
            value={delta.label}
            variant={delta.variant}
            className={`w-fit px-2 py-0.5 text-xs transition-all duration-200 ${
              deltaPulse ? "-translate-y-0.5 opacity-90" : "translate-y-0 opacity-100"
            }`}
          />

          <div className="border-t border-slate-200 dark:border-slate-800" />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total em Ativos</p>
              <p className="tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {formatBRL(animatedAssets)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total em Dívidas</p>
              <p className="tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {formatBRL(animatedDebts)}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
