import * as React from "react";
import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { CategoryGroupRow } from "@/src/features/categories/components/CategoryGroupRow";
import { CategoryRow } from "@/src/features/categories/components/CategoryRow";
import type { CategoryGroupAggregate } from "@/src/features/categories/utils/categoryAggregates";
import { formatBRL } from "@/src/utils/format";

type CategoriesTreeListProps = {
  groups: CategoryGroupAggregate[];
  totalSpent: number;
  monthQuery: string;
};

export function CategoriesTreeList({
  groups,
  totalSpent,
  monthQuery
}: CategoriesTreeListProps): React.JSX.Element {
  const [collapsedByGroup, setCollapsedByGroup] = React.useState<Record<string, boolean>>({});

  const maxCategoryValue = React.useMemo(() => {
    const values = groups.flatMap((group) => group.children.map((child) => child.value));
    return Math.max(1, ...values);
  }, [groups]);

  const toggleGroup = React.useCallback((groupId: string): void => {
    setCollapsedByGroup((previous) => ({
      ...previous,
      [groupId]: !previous[groupId]
    }));
  }, []);

  const buildCategoryHref = React.useCallback(
    (categoryId: string | null): string =>
      categoryId
        ? `/transactions?${monthQuery}&categoryId=${encodeURIComponent(categoryId)}`
        : `/transactions?${monthQuery}&category=uncategorized`,
    [monthQuery]
  );

  return (
    <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-border dark:bg-card">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          CATEGORIAS DO SISTEMA
        </p>
        <p className="tabular-nums text-sm font-semibold text-foreground">{formatBRL(totalSpent)}</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground dark:border-border dark:text-muted-foreground/80">
          Sem gastos registrados para este mês.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-3 md:hidden">
            {groups.map((group) => {
              const collapsed = collapsedByGroup[group.id] ?? false;

              return (
                <section key={`mobile-${group.id}`} className="rounded-xl border border-border/70 p-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{group.children.length} categoria(s)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatBRL(group.total)}</p>
                      <p className="text-xs text-muted-foreground">{collapsed ? "Expandir" : "Recolher"}</p>
                    </div>
                  </button>

                  {!collapsed ? (
                    <div className="mt-3 space-y-2">
                      {group.children.map((item) => (
                        <Link
                          key={`${group.id}-${item.categoryId ?? item.name}-mobile`}
                          href={buildCategoryHref(item.categoryId)}
                          className="block rounded-lg border border-border/70 px-3 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{item.share.toFixed(1)}% do mês</p>
                            </div>
                            <p className="text-sm font-semibold text-foreground">{formatBRL(item.value)}</p>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/80">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(2, (item.value / maxCategoryValue) * 100)}%`,
                                backgroundColor: item.color
                              }}
                            />
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <div className="hidden md:block">
            <p className="px-1 text-xs text-muted-foreground sm:hidden dark:text-muted-foreground/80">
              Deslize para os lados para visualizar todas as colunas.
            </p>

            <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border dark:[&::-webkit-scrollbar-thumb]:bg-border">
              <div className="min-w-[560px] space-y-3">
                <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Nome</span>
                  <span>Peso</span>
                  <span className="text-right">Valor</span>
                </div>

                {groups.map((group) => {
                  const collapsed = collapsedByGroup[group.id] ?? false;

                  return (
                    <section key={group.id} className="space-y-1">
                      <CategoryGroupRow
                        name={group.name}
                        total={group.total}
                        count={group.children.length}
                        collapsed={collapsed}
                        onToggle={() => toggleGroup(group.id)}
                      />

                      {!collapsed ? (
                        <div className="space-y-0.5 border-l border-border pl-4 dark:border-border">
                          {group.children.map((item) => (
                            <CategoryRow
                              key={`${group.id}-${item.categoryId ?? item.name}`}
                              item={item}
                              monthQuery={monthQuery}
                              relativePercentage={(item.value / maxCategoryValue) * 100}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}


