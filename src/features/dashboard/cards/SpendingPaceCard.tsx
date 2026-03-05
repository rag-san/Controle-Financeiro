import React from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { SpendingPaceChart, type SpendingPacePoint } from "@/src/features/dashboard/charts/SpendingPaceChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatBRL, formatSignedPercent } from "@/src/utils/format";

interface SpendingPaceCardProps {
  paceDelta: number;
  variationPercent: number;
  previousExpense: number;
  chartData: SpendingPacePoint[];
  currentLabel: string;
  previousLabel: string;
  periodDescription: string;
  hrefVerTodas?: string;
  hrefImportarExtrato?: string;
}

function resolveBadgeVariant(value: number): "positive" | "negative" | "neutral" {
  if (value < 0) return "positive";
  if (value > 0) return "negative";
  return "neutral";
}

function resolveDeltaBadgeClass(variationPercent: number): string {
  const variant = resolveBadgeVariant(variationPercent);

  if (variant === "positive") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200";
  }

  if (variant === "negative") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200";
  }

  return "bg-secondary text-secondary-foreground";
}

export function SpendingPaceCard({
  paceDelta,
  variationPercent,
  previousExpense,
  chartData,
  currentLabel,
  previousLabel,
  periodDescription,
  hrefVerTodas = "/transactions",
  hrefImportarExtrato = "/transactions?import=1"
}: SpendingPaceCardProps): React.JSX.Element {
  const hasData = chartData.some((item) => item.current > 0 || item.previous > 0);
  const isBelow = paceDelta >= 0;
  const headlineValue = formatBRL(Math.abs(paceDelta));
  const headlineLabel = isBelow ? "abaixo" : "acima";
  const headlineLabelClass = isBelow
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
  const markerLabel = `${headlineValue} ${headlineLabel}`;
  const deltaClass = resolveDeltaBadgeClass(variationPercent);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-muted-foreground">
            <span>Ritmo de gastos</span>
            <Info className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden="true" />
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Comparativo acumulado {periodDescription}.
          </p>
        </div>
        <Link
          href={hrefVerTodas}
          className="text-xs font-semibold text-primary transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver todas ↗
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="break-words text-4xl font-black tracking-tight text-foreground">
            {headlineValue} <span className={cn("text-2xl", headlineLabelClass)}>{headlineLabel}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", deltaClass)}>
              {formatSignedPercent(variationPercent)}
            </span>
            <span>vs {formatBRL(previousExpense)} mes anterior</span>
          </div>
        </div>

        {hasData ? (
          <div className="app-surface-inset rounded-xl p-2">
            <SpendingPaceChart
              data={chartData}
              currentLabel={currentLabel}
              previousLabel={previousLabel}
              markerLabel={markerLabel}
            />
          </div>
        ) : (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 px-4 text-sm text-muted-foreground">
            <p className="text-center">Dados disponiveis apos os primeiros lancamentos do periodo.</p>
            <Link
              href={hrefImportarExtrato}
              className="inline-flex h-8 items-center rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Adicionar transações
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
