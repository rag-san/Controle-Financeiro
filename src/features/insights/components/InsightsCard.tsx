import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { InsightItem } from "@/src/features/insights/components/InsightItem";
import type { Insight } from "@/src/features/insights/types";

type InsightsCardProps = {
  insights: Insight[];
  loading?: boolean;
  maxItems?: number;
};

export function InsightsCard({
  insights,
  loading = false,
  maxItems = 6
}: InsightsCardProps): React.JSX.Element {
  const visibleInsights = insights.slice(0, Math.max(1, maxItems));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Insights</CardTitle>
        <p className="text-sm text-muted-foreground">Sinais automáticos para reduzir gastos e melhorar organização.</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : visibleInsights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Ainda não há sinais fortes para o período selecionado.
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Lista de insights financeiros">
            {visibleInsights.map((insight) => (
              <InsightItem key={insight.id} insight={insight} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
