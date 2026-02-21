import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/src/components/ui/Card";
import type { KpiTrend } from "@/src/features/reports/utils/kpis";
import { formatBRL, formatPercent } from "@/src/utils/format";

type KpiCardProps = {
  label: string;
  value: number;
  trend: KpiTrend;
  helpText: string;
  valueType?: "currency" | "percent";
  tone?: "neutral" | "income" | "expense";
};

function renderTrendText(trend: KpiTrend): string {
  if (trend.deltaPercent === null) return "—";
  const prefix = trend.deltaPercent > 0 ? "+" : "";
  return `${prefix}${formatPercent(trend.deltaPercent)}`;
}

function resolveTrendTone(trend: KpiTrend): string {
  if (trend.direction === "up") return "text-emerald-600 dark:text-emerald-400";
  if (trend.direction === "down") return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

function TrendIcon({ trend }: { trend: KpiTrend }): React.JSX.Element {
  if (trend.direction === "up") return <ArrowUpRight className="h-3.5 w-3.5" />;
  if (trend.direction === "down") return <ArrowDownRight className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

export function KpiCard({
  label,
  value,
  trend,
  helpText,
  valueType = "currency",
  tone = "neutral"
}: KpiCardProps): React.JSX.Element {
  const valueClassName =
    tone === "income"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "expense"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-slate-100";

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 tabular-nums text-3xl font-semibold ${valueClassName}`}>
        {valueType === "percent" ? formatPercent(value) : formatBRL(value)}
      </p>

      <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${resolveTrendTone(trend)}`}>
        <TrendIcon trend={trend} />
        <span>{renderTrendText(trend)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helpText}</p>
    </Card>
  );
}

