import Link from "next/link";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { SpendingPaceChart, type SpendingPacePoint } from "@/src/features/dashboard/charts/SpendingPaceChart";
import { Badge } from "@/src/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { formatBRL, formatSignedPercent } from "@/src/utils/format";

interface SpendingPaceCardProps {
  chartAccumulatedData: SpendingPacePoint[];
  chartDailyData?: SpendingPacePoint[];
  compareUntilDay?: number;
  currentLabel: string;
  previousLabel: string;
  periodDescription: string;
  hrefVerTodas?: string;
}

type SpendingTrendMode = "accumulated" | "daily";

function resolveBadgeVariant(value: number): "positive" | "negative" | "neutral" {
  if (value < 0) return "positive";
  if (value > 0) return "negative";
  return "neutral";
}

function safeVariation(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function sortByDay(series: SpendingPacePoint[]): SpendingPacePoint[] {
  return [...series].sort((a, b) => a.day - b.day);
}

function deriveDailyFromAccumulated(series: SpendingPacePoint[]): SpendingPacePoint[] {
  let previousCurrent = 0;
  let previousPrevious = 0;

  return series.map((point) => {
    const current = round2(point.current - previousCurrent);
    const previous = round2(point.previous - previousPrevious);
    previousCurrent = point.current;
    previousPrevious = point.previous;

    return {
      day: point.day,
      current: current < 0 ? 0 : current,
      previous: previous < 0 ? 0 : previous
    };
  });
}

function isSameDaySeries(a: SpendingPacePoint[], b: SpendingPacePoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => point.day === b[index]?.day);
}

export function SpendingPaceCard({
  chartAccumulatedData,
  chartDailyData,
  compareUntilDay,
  currentLabel,
  previousLabel,
  periodDescription,
  hrefVerTodas = "/transactions"
}: SpendingPaceCardProps): React.JSX.Element {
  const [mode, setMode] = useState<SpendingTrendMode>("accumulated");
  const accumulatedSeries = useMemo(() => sortByDay(chartAccumulatedData), [chartAccumulatedData]);

  const dailySeries = useMemo(() => {
    const fallback = deriveDailyFromAccumulated(accumulatedSeries);
    if (!chartDailyData || chartDailyData.length === 0) return fallback;

    const normalizedDaily = sortByDay(chartDailyData);
    return isSameDaySeries(accumulatedSeries, normalizedDaily) ? normalizedDaily : fallback;
  }, [accumulatedSeries, chartDailyData]);

  const activeSeries = mode === "daily" ? dailySeries : accumulatedSeries;
  const compareDay = compareUntilDay ?? accumulatedSeries[accumulatedSeries.length - 1]?.day ?? 1;
  const totalsPoint = accumulatedSeries[accumulatedSeries.length - 1] ?? {
    day: compareDay,
    current: 0,
    previous: 0
  };

  const paceDelta = round2(totalsPoint.previous - totalsPoint.current);
  const variationPercent = round2(safeVariation(totalsPoint.current, totalsPoint.previous));
  const hasData = accumulatedSeries.some((item) => item.current > 0 || item.previous > 0);
  const isBelow = paceDelta >= 0;
  const headlineValue = formatBRL(Math.abs(paceDelta));
  const headlineLabel = isBelow ? "abaixo" : "acima";
  const modeDescription =
    mode === "daily"
      ? `Comparativo diário ${periodDescription}, até o dia ${compareDay}.`
      : `Comparativo acumulado ${periodDescription}, até o dia ${compareDay}.`;

  return (
    <Card className="h-full border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span>Ritmo de gastos</span>
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">{modeDescription}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setMode("accumulated")}
              className={[
                "h-7 rounded-md px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === "accumulated"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              ].join(" ")}
            >
              Acumulado
            </button>
            <button
              type="button"
              onClick={() => setMode("daily")}
              className={[
                "h-7 rounded-md px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === "daily"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              ].join(" ")}
            >
              Diário
            </button>
          </div>
          <Link
            href={hrefVerTodas}
            className="text-sm font-semibold text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todas ↗
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-4xl font-semibold tracking-tight text-foreground">
            {headlineValue} <span className="text-3xl text-muted-foreground">{headlineLabel}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge value={formatSignedPercent(variationPercent)} variant={resolveBadgeVariant(variationPercent)} />
            <span>vs {formatBRL(totalsPoint.previous)} mês anterior</span>
          </div>
        </div>

        {hasData ? (
          <SpendingPaceChart
            data={activeSeries}
            currentLabel={currentLabel}
            previousLabel={previousLabel}
            compareUntilDay={compareDay}
          />
        ) : (
          <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-300/90 text-sm text-muted-foreground dark:border-slate-800">
            Dados disponíveis após os primeiros lançamentos do período.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
