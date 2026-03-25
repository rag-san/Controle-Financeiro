import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type TransactionsKpiCardsProps = {
  income: number;
  expense: number;
  cashOutflow?: number;
  periodBalance: number;
  cashBalance: number;
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
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-secondary/70 p-4 shadow-[0_8px_24px_hsl(var(--overlay) / 0.08)] dark:from-card dark:via-card dark:to-secondary/65",
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
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p>
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
  cashOutflow,
  periodBalance,
  cashBalance,
  periodLabel
}: TransactionsKpiCardsProps): React.JSX.Element {
  const periodBalanceHint = `${periodBalance >= 0 ? "+" : "-"} ${formatMoney(Math.abs(periodBalance))}`;
  const normalizedPeriodLabel = periodLabel.trim().length > 0 ? periodLabel : "período selecionado";
  const outflowValue = cashOutflow ?? expense;

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
        valueHint="Entradas classificadas (sem transferências)"
        icon={<ArrowDownLeft className="h-4 w-4" />}
        tone={{
          borderClassName: "border-success/20",
          glowClassName: "bg-success/10",
          iconClassName: "text-success",
          iconContainerClassName:
            "border-success/20 bg-success/10 text-success",
          valueClassName: "text-success",
          badgeClassName: "bg-success/10 text-success"
        }}
      />

      <KpiCard
        {...sharedProps}
        title="Saída real de caixa"
        value={formatMoney(outflowValue)}
        valueHint={`Despesas classificadas: ${formatMoney(expense)}`}
        icon={<ArrowUpRight className="h-4 w-4" />}
        tone={{
          borderClassName: "border-error/20",
          glowClassName: "bg-error/10",
          iconClassName: "text-error",
          iconContainerClassName:
            "border-error/20 bg-error/10 text-error",
          valueClassName: "text-error",
          badgeClassName: "bg-error/10 text-error"
        }}
      />

      <KpiCard
        periodLabel="Saldo atual (todas as datas)"
        title="Saldo em conta"
        value={formatMoney(cashBalance)}
        valueHint={`Variação real em ${normalizedPeriodLabel}: ${periodBalanceHint}`}
        icon={<Scale className="h-4 w-4" />}
        tone={{
          borderClassName:
            cashBalance >= 0
              ? "border-info/20"
              : "border-warning/20",
          glowClassName:
            cashBalance >= 0 ? "bg-info/10" : "bg-warning/10",
          iconClassName:
            cashBalance >= 0 ? "text-info" : "text-warning",
          iconContainerClassName:
            cashBalance >= 0
              ? "border-info/20 bg-info/10 text-info"
              : "border-warning/20 bg-warning/10 text-warning",
          valueClassName:
            cashBalance >= 0 ? "text-foreground" : "text-warning",
          badgeClassName:
            cashBalance >= 0
              ? "border border-info/20 bg-info/10 text-foreground"
              : "bg-warning/10 text-warning"
        }}
      />
    </section>
  );
}



