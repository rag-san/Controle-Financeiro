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
      className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
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
                ? "bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-[0_8px_18px_rgba(14,116,144,0.35)]"
                : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            ].join(" ")}
          >
            {labelByValue[option.value] ?? option.label}
          </button>
        );
      })}

    </div>
  );
}
