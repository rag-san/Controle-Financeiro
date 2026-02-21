import { Select } from "@/src/components/ui/Select";
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
  return (
    <div className="min-w-[190px]">
      <label htmlFor="cashflow-period-select" className="sr-only">
        Selecionar período do fluxo de caixa
      </label>
      <Select
        id="cashflow-period-select"
        value={value}
        onChange={(event) => onChange(event.target.value as CashflowPeriodKey)}
        className="h-10 rounded-xl border-border/90 bg-card px-3 text-sm"
        disabled={disabled}
        aria-label="Selecionar período do fluxo de caixa"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
