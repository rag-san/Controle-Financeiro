import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type TransactionsKpiCardsProps = {
  income: number;
  expense: number;
  balance: number;
  periodLabel: string;
};

function KpiCard({
  title,
  value,
  icon,
  valueClassName,
  periodLabel
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
  periodLabel: string;
}): React.JSX.Element {
  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-4">
      <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", valueClassName)}>{value}</p>
    </article>
  );
}

export function TransactionsKpiCards({
  income,
  expense,
  balance,
  periodLabel
}: TransactionsKpiCardsProps): React.JSX.Element {
  return (
    <section
      className="grid gap-3 md:grid-cols-3"
      aria-label="Resumo financeiro do periodo selecionado"
      role="status"
      aria-live="polite"
    >
      <KpiCard
        title="Receitas"
        value={formatMoney(income)}
        icon={<ArrowDownLeft className="h-4 w-4 text-emerald-600" />}
        valueClassName="text-emerald-600"
        periodLabel={periodLabel}
      />
      <KpiCard
        title="Despesas"
        value={formatMoney(expense)}
        icon={<ArrowUpRight className="h-4 w-4 text-rose-600" />}
        valueClassName="text-rose-600"
        periodLabel={periodLabel}
      />
      <KpiCard
        title="Saldo"
        value={formatMoney(balance)}
        icon={<Scale className={cn("h-4 w-4", balance >= 0 ? "text-emerald-600" : "text-rose-600")} />}
        valueClassName={balance >= 0 ? "text-emerald-600" : "text-rose-600"}
        periodLabel={periodLabel}
      />
    </section>
  );
}
