import Link from "next/link";
import type { CategorySpendItem } from "@/src/features/categories/utils/categoryAggregates";
import { CategoryProgressBar } from "@/src/features/categories/components/CategoryProgressBar";
import { formatBRL } from "@/src/utils/format";

type CategoryRowProps = {
  item: CategorySpendItem;
  monthQuery: string;
  relativePercentage: number;
};

function resolveInitial(name: string): string {
  const initial = name.trim().charAt(0).toUpperCase();
  return initial || "C";
}

export function CategoryRow({
  item,
  monthQuery,
  relativePercentage
}: CategoryRowProps): React.JSX.Element {
  const href = item.categoryId
    ? `/transactions?${monthQuery}&categoryId=${encodeURIComponent(item.categoryId)}`
    : `/transactions?${monthQuery}&category=uncategorized`;

  return (
    <Link
      href={href}
      className="group grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-4 px-3 py-2 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-900/40"
      aria-label={`Ver transações da categoria ${item.name}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
          style={{ backgroundColor: item.color }}
          aria-hidden="true"
        >
          {resolveInitial(item.name)}
        </span>
        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</span>
      </div>

      <div className="space-y-1">
        <CategoryProgressBar percentage={relativePercentage} color={item.color} />
        <p className="tabular-nums text-xs text-slate-500 dark:text-slate-400">{item.share.toFixed(1)}%</p>
      </div>

      <p className="tabular-nums text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
        {formatBRL(item.value)}
      </p>
    </Link>
  );
}
