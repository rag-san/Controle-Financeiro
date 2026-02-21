import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import type { RecurringItem } from "@/src/features/recurring/types";
import { formatBRL } from "@/src/utils/format";

type RecurringItemRowProps = {
  item: RecurringItem;
  paidThisMonth: boolean;
  onTogglePaid: (item: RecurringItem, paid: boolean) => void;
};

const BRAND_ICON_BY_KEYWORD: Array<{ keyword: string; label: string }> = [
  { keyword: "google", label: "G" },
  { keyword: "icloud", label: "iC" },
  { keyword: "spotify", label: "S" },
  { keyword: "netflix", label: "N" },
  { keyword: "disney", label: "D+" },
  { keyword: "youtube", label: "YT" },
  { keyword: "amazon", label: "A" }
];

function resolveBrandLabel(name: string): string {
  const normalized = name.toLowerCase();
  const match = BRAND_ICON_BY_KEYWORD.find((entry) => normalized.includes(entry.keyword));
  if (match) return match.label;

  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "R";
}

export function RecurringItemRow({
  item,
  paidThisMonth,
  onTogglePaid
}: RecurringItemRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {resolveBrandLabel(item.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {item.category?.name ?? "Sem categoria"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
          {formatBRL(Math.abs(item.amount))}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onTogglePaid(item, !paidThisMonth)}
          className="h-8 px-2 text-xs"
          aria-label={
            paidThisMonth
              ? `Marcar ${item.name} como não pago neste mês`
              : `Marcar ${item.name} como pago neste mês`
          }
        >
          {paidThisMonth ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Pago
            </>
          ) : (
            <>
              <Circle className="h-3.5 w-3.5 text-slate-400" />
              Marcar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
