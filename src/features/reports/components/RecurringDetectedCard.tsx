import Link from "next/link";
import { format } from "date-fns";
import { Repeat2 } from "lucide-react";
import { Card } from "@/src/components/ui/Card";
import type { ReportsRecurringDetected } from "@/src/features/reports/types";
import { formatBRL } from "@/src/utils/format";

type RecurringDetectedCardProps = {
  items: ReportsRecurringDetected[];
};

export function RecurringDetectedCard({ items }: RecurringDetectedCardProps): React.JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recorrências detectadas
        </h3>
        <Link
          href="/recurring"
          className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-blue-300 dark:hover:text-blue-200"
        >
          Abrir Recorrentes
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-sm text-muted-foreground dark:border-border dark:text-muted-foreground/80">
          Nenhuma recorrência detectada para este filtro.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.merchantKey}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/80 px-3 py-2 dark:border-border"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium text-foreground">{item.merchantLabel}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.nextExpectedDate ? `Próxima estimada: ${format(item.nextExpectedDate, "dd/MM/yyyy")}` : "Próxima estimada: —"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Repeat2 className="h-4 w-4 text-muted-foreground/80" aria-hidden="true" />
                <div className="text-right">
                  <p className="tabular-nums text-sm font-semibold text-foreground">
                    {formatBRL(item.estimatedMonthlyCost)}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.occurrences} ocorrências</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}



