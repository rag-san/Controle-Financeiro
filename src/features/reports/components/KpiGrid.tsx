import { KpiCard } from "@/src/features/reports/components/KpiCard";
import { buildReportKpis } from "@/src/features/reports/utils/kpis";
import type { ReportsTotals } from "@/src/features/reports/types";

type KpiGridProps = {
  current: ReportsTotals;
  previous: ReportsTotals;
};

export function KpiGrid({ current, previous }: KpiGridProps): React.JSX.Element {
  const kpis = buildReportKpis({ current, previous });

  return (
    <div className={`grid gap-4 ${kpis.length > 3 ? "lg:grid-cols-4 md:grid-cols-2" : "md:grid-cols-3"}`}>
      {kpis.map((kpi) => {
        const tone =
          kpi.id === "income"
            ? "income"
            : kpi.id === "expense"
              ? "expense"
              : "neutral";

        return (
          <KpiCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            trend={kpi.trend}
            helpText={kpi.helpText}
            valueType={kpi.id === "savings-rate" ? "percent" : "currency"}
            tone={tone}
          />
        );
      })}
    </div>
  );
}

