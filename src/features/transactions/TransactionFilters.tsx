"use client";

import { Select } from "@/components/ui/select";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { FormField } from "@/src/components/ui/FormField";
import { Input } from "@/src/components/ui/Input";

export type TransactionFiltersState = {
  period: "all" | "30d" | "current-month" | "custom";
  accountId: string;
  type: string;
  categoryId: string;
  q: string;
};

type TransactionFiltersProps = {
  filters: TransactionFiltersState;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onChange: (next: Partial<TransactionFiltersState>) => void;
  onClear: () => void;
  busy?: boolean;
};

export function TransactionFilters({
  filters,
  accounts,
  categories,
  onChange,
  onClear,
  busy = false
}: TransactionFiltersProps): React.JSX.Element {
  return (
    <section className="surface-card p-4" aria-label="Filtros de transacoes">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => event.preventDefault()}
        aria-busy={busy}
      >
        <FormField label="Periodo" id="tx-filter-period">
          {(fieldProps) => (
            <Select
              {...fieldProps}
              value={filters.period}
              onChange={(event) => onChange({ period: event.target.value as TransactionFiltersState["period"] })}
            >
              <option value="all">Todo o periodo</option>
              <option value="30d">Ultimos 30 dias</option>
              <option value="current-month">Mes atual</option>
              <option value="custom">Personalizado</option>
            </Select>
          )}
        </FormField>

        <FormField label="Conta" id="tx-filter-account">
          {(fieldProps) => (
            <Select {...fieldProps} value={filters.accountId} onChange={(event) => onChange({ accountId: event.target.value })}>
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Tipo" id="tx-filter-type">
          {(fieldProps) => (
            <Select {...fieldProps} value={filters.type} onChange={(event) => onChange({ type: event.target.value })}>
              <option value="">Todos os tipos</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </Select>
          )}
        </FormField>

        <FormField label="Categoria" id="tx-filter-category">
          {(fieldProps) => (
            <Select {...fieldProps} value={filters.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Buscar descricao" id="tx-filter-query">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              value={filters.q}
              onChange={(event) => onChange({ q: event.target.value })}
              placeholder="Ex: supermercado"
            />
          )}
        </FormField>
      </form>

      <div className="mt-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={onClear} className="w-full sm:w-auto" disabled={busy}>
          Limpar filtros
        </Button>
      </div>
    </section>
  );
}

