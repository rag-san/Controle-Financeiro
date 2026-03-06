import { Card } from "@/src/components/ui/Card";
import { RecurringProgressRing } from "@/src/features/recurring/charts/RecurringProgressRing";
import type { RecurringTotals } from "@/src/features/recurring/utils/recurringTotals";
import { formatBRL } from "@/src/utils/format";

type RecurringSummaryCardProps = {
  totals: RecurringTotals;
};

export function RecurringSummaryCard({ totals }: RecurringSummaryCardProps): React.JSX.Element {
  return (
    <Card className="w-full rounded-2xl border border-border bg-card px-4 py-5 shadow-sm dark:border-border dark:bg-card sm:px-6 sm:py-7">
      <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="text-center md:text-left">
          <p className="tabular-nums break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {formatBRL(totals.remaining)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Falta pagar este mês</p>
        </div>

        <div className="mx-auto">
          <RecurringProgressRing paid={totals.paid} remaining={totals.remaining} />
        </div>

        <div className="text-center md:text-right">
          <p className="tabular-nums break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {formatBRL(totals.paid)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Pago até agora</p>
        </div>
      </div>
    </Card>
  );
}


