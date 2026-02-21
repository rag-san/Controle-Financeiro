import { Download, FileText } from "lucide-react";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Select } from "@/src/components/ui/Select";
import type { ReportsPeriodPreset } from "@/src/features/reports/types";
import { REPORTS_PERIOD_OPTIONS } from "@/src/features/reports/utils/period";

type ReportsFiltersProps = {
  preset: ReportsPeriodPreset;
  onPresetChange: (preset: ReportsPeriodPreset) => void;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  accountId: string;
  categoryId: string;
  onAccountIdChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  disabled?: boolean;
};

export function ReportsFilters({
  preset,
  onPresetChange,
  accounts,
  categories,
  accountId,
  categoryId,
  onAccountIdChange,
  onCategoryIdChange,
  disabled = false
}: ReportsFiltersProps): React.JSX.Element {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Selecionar período" className="flex flex-wrap items-center gap-2">
            {REPORTS_PERIOD_OPTIONS.map((option) => {
              const selected = preset === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={selected ? "primary" : "outline"}
                  aria-pressed={selected}
                  onClick={() => onPresetChange(option.value)}
                  disabled={disabled}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              title="Exportação CSV em breve"
              aria-label="Exportar CSV (indisponível)"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              title="Exportação PDF em breve"
              aria-label="Exportar PDF (indisponível)"
            >
              <FileText className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="reports-filter-account" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Conta
            </label>
            <Select
              id="reports-filter-account"
              value={accountId}
              onChange={(event) => onAccountIdChange(event.target.value)}
              disabled={disabled}
            >
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="reports-filter-category" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Categoria
            </label>
            <Select
              id="reports-filter-category"
              value={categoryId}
              onChange={(event) => onCategoryIdChange(event.target.value)}
              disabled={disabled}
            >
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </Card>
  );
}

