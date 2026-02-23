import { Card } from "@/src/components/ui/Card";
import { RecurringProgressRing } from "@/src/features/recurring/charts/RecurringProgressRing";
import type { RecurringTotals } from "@/src/features/recurring/utils/recurringTotals";
import { formatBRL } from "@/src/utils/format";

type RecurringSummaryCardProps = {
  totals: RecurringTotals;
};

export function RecurringSummaryCard({ totals }: RecurringSummaryCardProps): React.JSX.Element {
  return (
    <Card className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-7 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="text-center md:text-left">
          <p className="tabular-nums text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {formatBRL(totals.remaining)}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Falta pagar este mês</p>
        </div>

        <div className="mx-auto">
          <RecurringProgressRing paid={totals.paid} remaining={totals.remaining} />
        </div>

        <div className="text-center md:text-right">
          <p className="tabular-nums text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {formatBRL(totals.paid)}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pago até agora</p>
        </div>
      </div>
    </Card>
  );
}
