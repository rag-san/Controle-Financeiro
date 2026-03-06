import { KpiCard } from "@/src/features/reports/components/KpiCard";
import { buildReportKpis } from "@/src/features/reports/utils/kpis";
import type { ReportsCashSummary, ReportsTotals } from "@/src/features/reports/types";

type KpiGridProps = {
  current: ReportsTotals;
  previous: ReportsTotals;
  cash: ReportsCashSummary;
};

export function KpiGrid({ current, previous, cash }: KpiGridProps): React.JSX.Element {
  const kpis = buildReportKpis({ current, previous, cash });

  return (
    <div className={`grid gap-4 ${kpis.length > 3 ? "lg:grid-cols-4 md:grid-cols-2" : "md:grid-cols-3"}`}>
      {kpis.map((kpi) => {
        const tone =
          kpi.id === "income"
            ? "income"
            : kpi.id === "expense" || kpi.id === "cash-outflow"
              ? "expense"
              : "neutral";

        return (
          <KpiCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            trend={kpi.trend}
            helpText={kpi.helpText}
            valueType="currency"
            tone={tone}
          />
        );
      })}
    </div>
  );
}
