"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AccountDTO, CategoryDTO } from "@/lib/types";

export type TransactionFilters = {
  period: "all" | "30d" | "current-month" | "custom";
  accountId: string;
  type: string;
  categoryId: string;
  q: string;
};

type FiltersRowProps = {
  filters: TransactionFilters;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onChange: (next: Partial<TransactionFilters>) => void;
  onClear: () => void;
};

export function FiltersRow({ filters, accounts, categories, onChange, onClear }: FiltersRowProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={filters.period} onChange={(event) => onChange({ period: event.target.value as TransactionFilters["period"] })}>
          <option value="all">Todo o periodo</option>
          <option value="30d">Ultimos 30 dias</option>
          <option value="current-month">Mes atual</option>
          <option value="custom">Personalizado</option>
        </Select>

        <Select value={filters.accountId} onChange={(event) => onChange({ accountId: event.target.value })}>
          <option value="">Todas as contas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>

        <Select value={filters.type} onChange={(event) => onChange({ type: event.target.value })}>
          <option value="">Todos os tipos</option>
          <option value="income">Receitas</option>
          <option value="expense">Despesas</option>
        </Select>

        <Select value={filters.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <Input
          placeholder="Buscar descricao"
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClear} className="w-full sm:w-auto">
          Limpar filtros
        </Button>
      </div>
    </div>
  );
}


