import Link from "next/link";
import { Info } from "lucide-react";
import { SpendingPaceChart, type SpendingPacePoint } from "@/src/features/dashboard/charts/SpendingPaceChart";
import { Badge } from "@/src/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
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
}

function resolveBadgeVariant(value: number): "positive" | "negative" | "neutral" {
  if (value < 0) return "positive";
  if (value > 0) return "negative";
  return "neutral";
}

export function SpendingPaceCard({
  paceDelta,
  variationPercent,
  previousExpense,
  chartData,
  currentLabel,
  previousLabel,
  periodDescription,
  hrefVerTodas = "/transactions"
}: SpendingPaceCardProps): React.JSX.Element {
  const hasData = chartData.some((item) => item.current > 0 || item.previous > 0);
  const isBelow = paceDelta >= 0;
  const headlineValue = formatBRL(Math.abs(paceDelta));
  const headlineLabel = isBelow ? "abaixo" : "acima";
  const markerLabel = `${headlineValue} ${headlineLabel}`;

  return (
    <Card className="h-full border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span>Ritmo de gastos</span>
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">Comparativo acumulado {periodDescription}.</p>
        </div>
        <Link
          href={hrefVerTodas}
          className="text-sm font-semibold text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver todas ↗
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-4xl font-semibold tracking-tight text-foreground">
            {headlineValue} <span className="text-3xl text-muted-foreground">{headlineLabel}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge value={formatSignedPercent(variationPercent)} variant={resolveBadgeVariant(variationPercent)} />
            <span>vs {formatBRL(previousExpense)} mes anterior</span>
          </div>
        </div>

        {hasData ? (
          <SpendingPaceChart
            data={chartData}
            currentLabel={currentLabel}
            previousLabel={previousLabel}
            markerLabel={markerLabel}
          />
        ) : (
          <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-300/90 text-sm text-muted-foreground dark:border-slate-800">
            Dados disponiveis apos os primeiros lancamentos do periodo.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
