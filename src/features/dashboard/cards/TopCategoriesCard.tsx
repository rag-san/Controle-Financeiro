import Link from "next/link";
import { Badge } from "@/src/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { CategoryPill } from "@/src/components/ui/CategoryPill";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { formatBRL, formatPercent } from "@/src/utils/format";

export type DashboardCategory = {
  categoryId: string;
  name: string;
  color: string;
  icon: string | null;
  current: number;
  previous: number;
  variation: number;
};

interface TopCategoriesCardProps {
  categorias: DashboardCategory[];
  hrefVerMais?: string;
  periodDescription: string;
}

function resolveStatus(item: DashboardCategory): "positive" | "negative" | "neutral" {
  if (item.current < item.previous) return "positive";
  if (item.current > item.previous) return "negative";
  return "neutral";
}

function resolveBarColor(item: DashboardCategory): "green" | "red" | "gray" {
  if (item.current < item.previous) return "green";
  if (item.current > item.previous) return "red";
  return "gray";
}

function formatVariationLabel(value: number): string {
  if (!Number.isFinite(value)) return "0,0%";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatPercent(value)}`;
}

function categoryBarPercentage(item: DashboardCategory): number {
  const base = Math.max(item.current, item.previous, 1);
  return (item.current / base) * 100;
}

export function TopCategoriesCard({
  categorias,
  hrefVerMais = "/categories",
  periodDescription
}: TopCategoriesCardProps): React.JSX.Element {
  return (
    <Card className="h-full border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Principais categorias</CardTitle>
          <p className="text-sm text-muted-foreground">Comparativo {periodDescription} vs mês anterior.</p>
        </div>
        <Link
          href={hrefVerMais}
          className="text-sm font-semibold text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver mais ↗
        </Link>
      </CardHeader>

      <CardContent>
        {categorias.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300/80 p-6 text-sm text-muted-foreground dark:border-slate-800" role="status">
            Sem categorias com gastos no período selecionado.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <span>Categoria</span>
              <span className="text-right">Atual</span>
              <span>vs Mes anterior</span>
              <span className="text-center">Variacao</span>
              <span className="text-right">Anterior</span>
            </div>

            {categorias.map((item) => {
              const status = resolveStatus(item);

              return (
                <div
                  key={item.categoryId}
                  className="rounded-xl border border-border/80 p-3 md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4 md:rounded-none md:border-0 md:p-0"
                >
                  <div>
                    <CategoryPill name={item.name} />
                  </div>

                  <div className="mt-2 text-sm font-semibold text-foreground md:mt-0 md:text-right">
                    {formatBRL(item.current)}
                  </div>

                  <div className="mt-2 md:mt-0">
                    <ProgressBar percentage={categoryBarPercentage(item)} color={resolveBarColor(item)} />
                  </div>

                  <div className="mt-2 flex md:mt-0 md:justify-center">
                    <Badge value={formatVariationLabel(item.variation)} variant={status} />
                  </div>

                  <div className="mt-2 text-sm font-semibold text-muted-foreground md:mt-0 md:text-right">
                    {formatBRL(item.previous)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

