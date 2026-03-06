import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
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
  hrefImportarExtrato?: string;
  periodDescription: string;
}

function resolveStatus(item: DashboardCategory): "positive" | "negative" | "neutral" {
  if (item.current < item.previous) return "positive";
  if (item.current > item.previous) return "negative";
  return "neutral";
}

function formatVariationLabel(value: number): string {
  if (!Number.isFinite(value)) return "0,0%";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatPercent(value)}`;
}

function resolveVariationClass(status: "positive" | "negative" | "neutral"): string {
  if (status === "negative") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200";
  }

  if (status === "positive") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200";
  }

  return "bg-secondary text-secondary-foreground";
}

export function TopCategoriesCard({
  categorias,
  hrefVerMais = "/categories",
  hrefImportarExtrato = "/transactions?import=1",
  periodDescription
}: TopCategoriesCardProps): React.JSX.Element {
  const maxCurrent = categorias.reduce((acc, item) => Math.max(acc, item.current), 0);

  return (
    <Card className="h-full" data-testid="dashboard-top-categories-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-[11px] tracking-[0.12em] text-muted-foreground">
            Principais categorias
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Comparativo {periodDescription} vs mes anterior.
          </p>
        </div>
        <Link
          href={hrefVerMais}
          className="text-xs font-semibold text-primary transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver mais ↗
        </Link>
      </CardHeader>

      <CardContent>
        {categorias.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground" role="status">
            <p>Sem categorias com gastos no periodo selecionado.</p>
            <Link
              href={hrefImportarExtrato}
              className="inline-flex h-8 items-center rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Adicionar transações
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-3 md:hidden">
              {categorias.map((item) => {
                const status = resolveStatus(item);
                const percentage =
                  maxCurrent > 0 ? Math.min(100, Math.max(0, (item.current / maxCurrent) * 100)) : 0;

                return (
                  <div key={`mobile-${item.categoryId}`} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color || "hsl(var(--muted-foreground))" }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{formatBRL(item.current)}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${resolveVariationClass(status)}`}
                      >
                        {formatVariationLabel(item.variation)}
                      </span>
                      <span>Anterior: {formatBRL(item.previous)}</span>
                    </div>

                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary/90">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: item.color || "hsl(var(--muted-foreground))"
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden space-y-3 md:block">
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border/70 px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                <span className="text-left">Categoria</span>
                <span className="text-right">Atual</span>
                <span className="text-right">Variacao</span>
                <span className="text-right">Anterior</span>
              </div>

              {categorias.map((item) => {
                const status = resolveStatus(item);
                const percentage =
                  maxCurrent > 0 ? Math.min(100, Math.max(0, (item.current / maxCurrent) * 100)) : 0;

                return (
                  <div key={item.categoryId} className="rounded-xl p-0">
                    <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color || "hsl(var(--muted-foreground))" }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-sm text-foreground">{item.name}</span>
                      </div>

                      <span className="text-right text-sm font-semibold text-foreground">
                        {formatBRL(item.current)}
                      </span>

                      <span className="text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${resolveVariationClass(status)}`}
                        >
                          {formatVariationLabel(item.variation)}
                        </span>
                      </span>

                      <span className="text-right text-sm text-muted-foreground">{formatBRL(item.previous)}</span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary/90">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: item.color || "hsl(var(--muted-foreground))"
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
