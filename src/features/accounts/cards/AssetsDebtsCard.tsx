import { Settings } from "lucide-react";
import * as React from "react";
import { Card } from "@/src/components/ui/Card";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { AssetsDebtsChart } from "@/src/features/accounts/charts/AssetsDebtsChart";
import { useAnimatedNumber } from "@/src/hooks/useAnimatedNumber";
import type { AccountsRangeKey, AssetsDebtsPoint, HoverPoint } from "@/src/features/accounts/types";
import { formatBRL, formatPercent, formatShortDate } from "@/src/utils/format";

const rangeOptions = [
  { label: "1W", value: "1W" },
  { label: "1M", value: "1M" },
  { label: "YTD", value: "YTD" },
  { label: "3M", value: "3M" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" }
] as const;

type AssetsDebtsCardProps = {
  assets: number;
  debts: number;
  previousAssets: number;
  previousDebts: number;
  chartData: AssetsDebtsPoint[];
  selectedRange: AccountsRangeKey;
  onRangeChange: (range: AccountsRangeKey) => void;
  loading?: boolean;
};

type DeltaDisplay = {
  text: string;
  className: string;
};

function resolveDeltaDisplay(
  current: number,
  previous: number,
  invertMeaning = false
): DeltaDisplay {
  if (previous === 0) {
    return {
      text: "→ N/A",
      className: "text-slate-500 dark:text-slate-400"
    };
  }

  const deltaPercent = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
  if (deltaPercent === 0) {
    return {
      text: "→ 0,0%",
      className: "text-slate-500 dark:text-slate-400"
    };
  }

  const arrow = deltaPercent > 0 ? "↑" : "↓";
  const value = deltaPercent > 0 ? `+${formatPercent(deltaPercent)}` : formatPercent(deltaPercent);
  const isPositive = invertMeaning ? deltaPercent < 0 : deltaPercent > 0;

  return {
    text: `${arrow} ${value}`,
    className: isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
  };
}

function MetricBlock({
  dotClassName,
  label,
  valueText,
  delta,
  hoverDateLabel,
  loading = false
}: {
  dotClassName: string;
  label: string;
  valueText: string;
  delta: DeltaDisplay;
  hoverDateLabel?: string;
  loading?: boolean;
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="space-y-2 sm:min-w-[13rem]">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 w-14 rounded-md" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-3 w-16 rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-1 sm:min-w-[13rem]">
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
        {label}
      </p>
      <p className="tabular-nums whitespace-nowrap text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
        {valueText}
      </p>
      <p className="min-h-[1rem] text-[11px] text-slate-500 dark:text-slate-400">
        {hoverDateLabel ? `em ${hoverDateLabel}` : ""}
      </p>
      <p className={`text-xs font-semibold ${delta.className}`}>{delta.text}</p>
    </div>
  );
}

export function AssetsDebtsCard({
  assets,
  debts,
  previousAssets,
  previousDebts,
  chartData,
  selectedRange,
  onRangeChange,
  loading = false
}: AssetsDebtsCardProps): React.JSX.Element {
  const [hoverPoint, setHoverPoint] = React.useState<HoverPoint>(null);

  React.useEffect(() => {
    setHoverPoint(null);
  }, [chartData, selectedRange]);

  const displayedAssets = hoverPoint ? hoverPoint.assets : assets;
  const displayedDebts = hoverPoint ? hoverPoint.debts : debts;

  const animatedAssets = useAnimatedNumber(displayedAssets, { durationMs: 380 });
  const animatedDebts = useAnimatedNumber(displayedDebts, { durationMs: 380 });

  const hoverDateLabel = hoverPoint ? formatShortDate(hoverPoint.date) : undefined;

  const assetsDelta = resolveDeltaDisplay(assets, previousAssets);
  const debtsDelta = resolveDeltaDisplay(debts, previousDebts, true);

  return (
    <Card
      className="space-y-5 rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
      aria-busy={loading}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-4 sm:flex sm:flex-wrap sm:items-start sm:gap-8">
          <MetricBlock
            dotClassName="bg-blue-500"
            label="Ativos"
            valueText={formatBRL(animatedAssets)}
            delta={assetsDelta}
            hoverDateLabel={hoverDateLabel}
            loading={loading}
          />
          <MetricBlock
            dotClassName="bg-orange-400"
            label="Dívidas"
            valueText={formatBRL(animatedDebts)}
            delta={debtsDelta}
            hoverDateLabel={hoverDateLabel}
            loading={loading}
          />
        </div>
        <button
          type="button"
          className="self-end rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:self-auto dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Configurar visualização de contas"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <AssetsDebtsChart
        data={chartData}
        range={selectedRange}
        loading={loading}
        a11ySummary="Evolucao de ativos e dividas no intervalo selecionado."
        onHoverPointChange={setHoverPoint}
      />

      <div className="flex justify-center overflow-x-auto pb-1">
        <SegmentedControl
          className="min-w-max"
          options={rangeOptions}
          value={selectedRange}
          onChange={onRangeChange}
          ariaLabel="Selecionar intervalo do grafico de contas"
        />
      </div>
    </Card>
  );
}
