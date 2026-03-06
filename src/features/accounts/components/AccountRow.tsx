import { Building2 } from "lucide-react";
import { formatBRL } from "@/src/utils/format";

type AccountRowProps = {
  name: string;
  subtitle: string;
  amount: number;
  amountSign?: "negative" | "positive" | "none";
  amountTone?: "default" | "negative" | "positive" | "muted";
  metaRight?: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  actionSlot?: React.ReactNode;
  hiddenAmount?: boolean;
};

function formatAmount(amount: number, sign: AccountRowProps["amountSign"]): string {
  const absolute = Math.abs(amount);

  if (sign === "negative") {
    return `-${formatBRL(absolute)}`;
  }

  if (sign === "positive") {
    return `+${formatBRL(absolute)}`;
  }

  return formatBRL(amount);
}

const amountToneClassMap: Record<NonNullable<AccountRowProps["amountTone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  muted: "text-muted-foreground"
};

export function AccountRow({
  name,
  subtitle,
  amount,
  amountSign = "none",
  amountTone = "default",
  metaRight,
  icon,
  iconClassName = "bg-secondary text-muted-foreground dark:bg-secondary dark:text-muted-foreground",
  actionSlot,
  hiddenAmount = false
}: AccountRowProps): React.JSX.Element {
  const amountText = hiddenAmount ? "••••••" : formatAmount(amount, amountSign);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 transition hover:bg-secondary/70 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-secondary/40">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconClassName}`}>
          {icon ?? <Building2 className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
        <div className="min-w-0 text-left sm:text-right">
          <p className={`text-sm font-semibold ${amountToneClassMap[amountTone]}`}>{amountText}</p>
          {metaRight ? <p className="truncate text-xs text-muted-foreground">{metaRight}</p> : null}
        </div>
        {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
      </div>
    </div>
  );
}


