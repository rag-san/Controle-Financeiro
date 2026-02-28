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

  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
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
    <Card className="h-full border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/70 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/70">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-slate-500 dark:text-slate-400">
            <span>Ritmo de gastos</span>
            <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Comparativo acumulado {periodDescription}.
          </p>
        </div>
        <Link
          href={hrefVerTodas}
          className="text-xs font-semibold text-sky-700 transition hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300 dark:hover:text-sky-200"
        >
          Ver todas ↗
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="break-words text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {headlineValue} <span className={cn("text-2xl", headlineLabelClass)}>{headlineLabel}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", deltaClass)}>
              {formatSignedPercent(variationPercent)}
            </span>
            <span>vs {formatBRL(previousExpense)} mes anterior</span>
          </div>
        </div>

        {hasData ? (
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-950/60">
            <SpendingPaceChart
              data={chartData}
              currentLabel={currentLabel}
              previousLabel={previousLabel}
              markerLabel={markerLabel}
            />
          </div>
        ) : (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300/90 px-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <p className="text-center">Dados disponiveis apos os primeiros lancamentos do periodo.</p>
            <Link
              href={hrefImportarExtrato}
              className="inline-flex h-8 items-center rounded-lg border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/60"
            >
              Adicionar transações
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
