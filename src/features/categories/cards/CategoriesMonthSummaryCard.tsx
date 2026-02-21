import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { CategoriesDonut } from "@/src/features/categories/charts/CategoriesDonut";
import type { CategoryDonutSlice } from "@/src/features/categories/utils/categoryAggregates";
import { formatBRL, formatMonthYearPtBr } from "@/src/utils/format";

type CategoriesMonthSummaryCardProps = {
  totalSpent: number;
  monthDate: Date;
  slices: CategoryDonutSlice[];
  onPreviousMonth: () => void;
  onNextMonth: () => void;
};

export function CategoriesMonthSummaryCard({
  totalSpent,
  monthDate,
  slices,
  onPreviousMonth,
  onNextMonth
}: CategoriesMonthSummaryCardProps): React.JSX.Element {
  const monthLabel = formatMonthYearPtBr(monthDate);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="space-y-1 text-center md:text-left">
          <p className="tabular-nums text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {formatBRL(totalSpent)}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">gasto em {monthLabel}</p>
        </div>

        <div className="mx-auto">
          <CategoriesDonut slices={slices} />
        </div>

        <div className="space-y-3 text-center md:text-right">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onPreviousMonth}
              aria-label="Mês anterior"
              className="h-7 w-7"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">{monthLabel}</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onNextMonth}
              aria-label="Próximo mês"
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
