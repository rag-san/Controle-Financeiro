import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { CategoryPill } from "@/src/components/ui/CategoryPill";
import type { ReportsCategorySpend } from "@/src/features/reports/types";
import { formatBRL } from "@/src/utils/format";

type SpendingByCategoryCardProps = {
  items: ReportsCategorySpend[];
};

export function SpendingByCategoryCard({ items }: SpendingByCategoryCardProps): React.JSX.Element {
  const topItems = items.slice(0, 8);
  const maxValue = Math.max(1, ...topItems.map((item) => item.value));

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Gastos por categoria
        </h3>
        <Link
          href="/categories"
          className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-blue-300 dark:hover:text-blue-200"
        >
          View all
        </Link>
      </div>

      {topItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Sem gastos por categoria no período selecionado.
        </p>
      ) : (
        <ul className="space-y-3">
          {topItems.map((item) => {
            const progress = Math.max(2, Math.round((item.value / maxValue) * 100));

            return (
              <li key={`${item.categoryId ?? item.name}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <CategoryPill name={item.name} size="sm" />
                  <span className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatBRL(item.value)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/70" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: item.color }} />
                  </div>
                  <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">{item.share.toFixed(1)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

