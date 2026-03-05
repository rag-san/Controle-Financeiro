import type { CashflowPeriodKey, CashflowPeriodOption } from "@/src/features/cashflow/types";

type PeriodSelectProps = {
  value: CashflowPeriodKey;
  options: CashflowPeriodOption[];
  onChange: (next: CashflowPeriodKey) => void;
  disabled?: boolean;
};

export function PeriodSelect({
  value,
  options,
  onChange,
  disabled = false
}: PeriodSelectProps): React.JSX.Element {
  const labelByValue: Record<CashflowPeriodKey, string> = {
    "1m": "1 mes",
    "3m": "3 meses",
    "6m": "6 meses",
    ytd: "YTD",
    "12m": "1 ano"
  };

  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-secondary/75 p-1 shadow-sm dark:border-border dark:bg-secondary/60"
      role="group"
      aria-label="Selecionar periodo do fluxo de caixa"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={selected}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled ? "cursor-not-allowed opacity-60" : "",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card hover:text-foreground dark:text-muted-foreground dark:hover:bg-secondary dark:hover:text-foreground"
            ].join(" ")}
          >
            {labelByValue[option.value] ?? option.label}
          </button>
        );
      })}

    </div>
  );
}


