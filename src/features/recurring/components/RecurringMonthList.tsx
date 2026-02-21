import { format } from "date-fns";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { RecurringItemRow } from "@/src/features/recurring/components/RecurringItemRow";
import type { RecurringItem } from "@/src/features/recurring/types";
import type { RecurringMonthGroup } from "@/src/features/recurring/utils/recurringTotals";
import { formatWeekdayShortPtBr } from "@/src/utils/format";

type RecurringMonthListProps = {
  groups: RecurringMonthGroup[];
  referenceDate: Date;
  onCreateNew: () => void;
  onTogglePaid: (item: RecurringItem, paid: boolean) => void;
};

const shortMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short"
});

function formatGroupLabel(date: Date): string {
  const weekday = formatWeekdayShortPtBr(date);
  const month = shortMonthFormatter.format(date).replace(".", "").toUpperCase();
  const day = format(date, "d");
  return `${weekday}, ${month} ${day}`;
}

function isPaidInMonth(item: RecurringItem, referenceDate: Date): boolean {
  if (!item.lastPaidAt) return false;
  return (
    item.lastPaidAt.getMonth() === referenceDate.getMonth() &&
    item.lastPaidAt.getFullYear() === referenceDate.getFullYear()
  );
}

export function RecurringMonthList({
  groups,
  referenceDate,
  onCreateNew,
  onTogglePaid
}: RecurringMonthListProps): React.JSX.Element {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          ESTE MÊS
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">No recurring items yet</p>
          <Button type="button" size="sm" className="mt-3" onClick={onCreateNew}>
            Criar Novo
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={`group-${group.dueDay}`} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {formatGroupLabel(group.date)}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <RecurringItemRow
                    key={item.id}
                    item={item}
                    paidThisMonth={isPaidInMonth(item, referenceDate)}
                    onTogglePaid={onTogglePaid}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
