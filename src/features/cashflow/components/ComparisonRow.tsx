import { Badge } from "@/src/components/ui/Badge";
import type { ComparisonMetric } from "@/src/features/cashflow/types";
import { formatBRL, formatSignedPercent } from "@/src/utils/format";

type ComparisonRowProps = {
  metric: ComparisonMetric;
  previousRangeLabel: string;
  invertMeaning?: boolean;
};

function resolveVariant(
  changePercent: number | null,
  invertMeaning: boolean
): "positive" | "negative" | "neutral" {
  if (changePercent === null || changePercent === 0) return "neutral";

  if (invertMeaning) {
    return changePercent < 0 ? "positive" : "negative";
  }

  return changePercent > 0 ? "positive" : "negative";
}

function resolveBadgeValue(changePercent: number | null): string {
  if (changePercent === null) return "N/A";
  return formatSignedPercent(changePercent);
}

export function ComparisonRow({
  metric,
  previousRangeLabel,
  invertMeaning = false
}: ComparisonRowProps): React.JSX.Element {
  const badgeValue = resolveBadgeValue(metric.changePercent);
  const badgeVariant = resolveVariant(metric.changePercent, invertMeaning);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Badge value={badgeValue} variant={badgeVariant} className="px-2 py-0.5 text-xs" />
      <span>
        vs {formatBRL(metric.previous)} em {previousRangeLabel}
      </span>
    </div>
  );
}
