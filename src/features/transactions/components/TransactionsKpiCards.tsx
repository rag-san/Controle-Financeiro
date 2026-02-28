import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type TransactionsKpiCardsProps = {
  income: number;
  expense: number;
  balance: number;
  periodLabel: string;
};

type KpiCardTone = {
  borderClassName: string;
  glowClassName: string;
  iconClassName: string;
  iconContainerClassName: string;
  valueClassName: string;
  badgeClassName: string;
};

function KpiCard({
  title,
  periodLabel,
  value,
  valueHint,
  icon,
  tone
}: {
  title: string;
  periodLabel: string;
  value: string;
  valueHint: string;
  icon: React.ReactNode;
  tone: KpiCardTone;
}): React.JSX.Element {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-slate-100/70 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/60",
        tone.borderClassName
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -left-7 -top-8 h-24 w-24 rounded-full blur-2xl",
          tone.glowClassName
        )}
      />

      <div className="relative z-[1] flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{periodLabel}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
            tone.iconContainerClassName
          )}
        >
          <span className={tone.iconClassName}>{icon}</span>
        </span>
      </div>

      <p className={cn("relative z-[1] mt-3 text-[1.7rem] font-black tracking-tight", tone.valueClassName)}>
        {value}
      </p>
      <div className="relative z-[1] mt-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
            tone.badgeClassName
          )}
        >
          {valueHint}
        </span>
      </div>
    </article>
  );
}

export function TransactionsKpiCards({
  income,
  expense,
  balance,
  periodLabel
}: TransactionsKpiCardsProps): React.JSX.Element {
  const sharedProps = { periodLabel };

  return (
    <section
      className="grid gap-3 md:grid-cols-3"
      aria-label="Resumo financeiro do período selecionado"
      role="status"
      aria-live="polite"
    >
      <KpiCard
        {...sharedProps}
        title="Receitas"
        value={formatMoney(income)}
        valueHint="Entradas no período"
        icon={<ArrowDownLeft className="h-4 w-4" />}
        tone={{
          borderClassName: "border-emerald-200/80 dark:border-emerald-900/60",
          glowClassName: "bg-emerald-400/35 dark:bg-emerald-500/25",
          iconClassName: "text-emerald-600 dark:text-emerald-300",
          iconContainerClassName:
            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
          valueClassName: "text-emerald-700 dark:text-emerald-300",
          badgeClassName:
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200"
        }}
      />

      <KpiCard
        {...sharedProps}
        title="Despesas"
        value={formatMoney(expense)}
        valueHint="Saídas no período"
        icon={<ArrowUpRight className="h-4 w-4" />}
        tone={{
          borderClassName: "border-rose-200/80 dark:border-rose-900/60",
          glowClassName: "bg-rose-400/35 dark:bg-rose-500/25",
          iconClassName: "text-rose-600 dark:text-rose-300",
          iconContainerClassName:
            "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
          valueClassName: "text-rose-700 dark:text-rose-300",
          badgeClassName: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200"
        }}
      />

      <KpiCard
        {...sharedProps}
        title="Saldo"
        value={formatMoney(balance)}
        valueHint={balance >= 0 ? "Resultado positivo" : "Resultado negativo"}
        icon={<Scale className="h-4 w-4" />}
        tone={{
          borderClassName:
            balance >= 0
              ? "border-sky-200/80 dark:border-sky-900/60"
              : "border-orange-200/80 dark:border-orange-900/60",
          glowClassName:
            balance >= 0 ? "bg-sky-400/35 dark:bg-sky-500/25" : "bg-orange-400/35 dark:bg-orange-500/25",
          iconClassName:
            balance >= 0 ? "text-sky-600 dark:text-sky-300" : "text-orange-600 dark:text-orange-300",
          iconContainerClassName:
            balance >= 0
              ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300"
              : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300",
          valueClassName:
            balance >= 0 ? "text-sky-700 dark:text-sky-300" : "text-orange-700 dark:text-orange-300",
          badgeClassName:
            balance >= 0
              ? "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200"
              : "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200"
        }}
      />
    </section>
  );
}
