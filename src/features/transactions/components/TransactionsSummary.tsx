import { ArrowDownLeft, ArrowUpRight, Landmark, Scale } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type TransactionsSummaryProps = {
  totalCount: number;
  income: number;
  expense: number;
  balance: number;
  className?: string;
};

function SummaryItem({
  icon,
  label,
  value,
  valueClassName
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="sr-only">{label}</span>
      <span className={cn("text-sm font-semibold", valueClassName)}>{value}</span>
    </div>
  );
}

export function TransactionsSummary({
  totalCount,
  income,
  expense,
  balance,
  className
}: TransactionsSummaryProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-x-4 gap-y-2", className)} role="status" aria-live="polite">
      <SummaryItem
        icon={<Landmark className="h-3.5 w-3.5" />}
        label="Total de transacoes"
        value={String(totalCount)}
      />
      <SummaryItem
        icon={<ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />}
        label="Total de entradas"
        value={formatMoney(income)}
        valueClassName="text-emerald-600"
      />
      <SummaryItem
        icon={<ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />}
        label="Total de saidas"
        value={formatMoney(expense)}
        valueClassName="text-rose-600"
      />
      <SummaryItem
        icon={<Scale className={cn("h-3.5 w-3.5", balance >= 0 ? "text-emerald-600" : "text-rose-600")} />}
        label="Saldo"
        value={formatMoney(balance)}
        valueClassName={balance >= 0 ? "text-emerald-600" : "text-rose-600"}
      />
    </div>
  );
}
