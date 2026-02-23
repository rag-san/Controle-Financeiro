import { CalendarDays, Funnel, Search } from "lucide-react";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";

export type TransactionsPeriod = "7d" | "30d" | "90d" | "this-month" | "last-month" | "custom" | "all";

export type TransactionsFiltersState = {
  period: TransactionsPeriod;
  accountId: string;
  type: "" | "income" | "expense" | "transfer";
  categoryId: string;
  from: string;
  to: string;
};

type TransactionsFiltersBarProps = {
  filters: TransactionsFiltersState;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  searchQuery: string;
  busy?: boolean;
  onSearchQueryChange: (value: string) => void;
  onChange: (next: Partial<TransactionsFiltersState>) => void;
  onClear: () => void;
};

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
  disabled
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="w-[168px] shrink-0 sm:min-w-[180px] sm:w-auto">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border-border/90 bg-card/80 text-sm"
        disabled={disabled}
      >
        {children}
      </Select>
    </div>
  );
}

export function TransactionsFiltersBar({
  filters,
  accounts,
  categories,
  searchQuery,
  busy = false,
  onSearchQueryChange,
  onChange,
  onClear
}: TransactionsFiltersBarProps): React.JSX.Element {
  return (
    <section
      className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
      aria-label="Filtros de transacoes"
      aria-busy={busy}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Funnel className="h-4 w-4" />
        <span>Filtros</span>
      </div>

      <div className="space-y-2">
        <div className="relative min-w-0">
          <label htmlFor="tx-filter-search" className="sr-only">
            Buscar transacoes
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="tx-filter-search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Buscar descricao ou estabelecimento"
            disabled={busy}
            className="h-10 rounded-xl border-border/90 bg-card/80 pl-9"
          />
        </div>

        <div className="overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
          <div className="flex min-w-max items-center gap-2 pr-1 sm:min-w-0 sm:flex-wrap">
            <FilterSelect
              id="tx-filter-period"
              label="Periodo"
              value={filters.period}
              onChange={(value) => onChange({ period: value as TransactionsPeriod })}
              disabled={busy}
            >
              <option value="7d">Ultimos 7 dias</option>
              <option value="30d">Ultimos 30 dias</option>
              <option value="90d">Ultimos 90 dias</option>
              <option value="this-month">Este mes</option>
              <option value="last-month">Mes passado</option>
              <option value="all">Todo periodo</option>
              <option value="custom">Personalizado</option>
            </FilterSelect>

            <FilterSelect
              id="tx-filter-account"
              label="Conta"
              value={filters.accountId}
              onChange={(value) => onChange({ accountId: value })}
              disabled={busy}
            >
              <option value="">Conta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              id="tx-filter-type"
              label="Tipo de transacao"
              value={filters.type}
              onChange={(value) => onChange({ type: value as TransactionsFiltersState["type"] })}
              disabled={busy}
            >
              <option value="">Todas as transacoes</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
              <option value="transfer">Transferencias</option>
            </FilterSelect>

            <FilterSelect
              id="tx-filter-category"
              label="Categoria"
              value={filters.categoryId}
              onChange={(value) => onChange({ categoryId: value })}
              disabled={busy}
            >
              <option value="">Categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </FilterSelect>

            {filters.period === "custom" ? (
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative">
                  <label htmlFor="tx-filter-from" className="sr-only">
                    Data inicial
                  </label>
                  <Input
                    id="tx-filter-from"
                    type="date"
                    value={filters.from}
                    onChange={(event) => onChange({ from: event.target.value })}
                    disabled={busy}
                    className="h-10 min-w-[152px] rounded-xl pr-9"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="relative">
                  <label htmlFor="tx-filter-to" className="sr-only">
                    Data final
                  </label>
                  <Input
                    id="tx-filter-to"
                    type="date"
                    value={filters.to}
                    onChange={(event) => onChange({ to: event.target.value })}
                    disabled={busy}
                    className="h-10 min-w-[152px] rounded-xl pr-9"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-1 py-0 text-sm text-muted-foreground hover:text-foreground"
          onClick={onClear}
          disabled={busy}
        >
          Limpar filtros
        </Button>
      </div>
    </section>
  );
}
