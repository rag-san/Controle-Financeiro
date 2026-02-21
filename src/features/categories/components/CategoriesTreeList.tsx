import * as React from "react";
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

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          CATEGORIAS DO SISTEMA
        </p>
        <p className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">{formatBRL(totalSpent)}</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Sem gastos registrados para este mês.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                  <div className="space-y-0.5 border-l border-slate-200 pl-4 dark:border-slate-800">
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
      )}
    </Card>
  );
}
