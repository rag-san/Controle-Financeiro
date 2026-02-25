import { CalendarDays, ChevronDown, ChevronUp, Funnel, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  disabled,
  className
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("w-full sm:min-w-[180px] sm:w-auto", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border-slate-200/90 bg-white text-sm dark:border-slate-800 dark:bg-slate-950"
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
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.period !== "30d") count += 1;
    if (filters.accountId) count += 1;
    if (filters.type) count += 1;
    if (filters.categoryId) count += 1;
    if (filters.period === "custom" && filters.from) count += 1;
    if (filters.period === "custom" && filters.to) count += 1;
    return count;
  }, [filters.accountId, filters.categoryId, filters.from, filters.period, filters.to, filters.type]);

  useEffect(() => {
    if (filters.period === "custom") {
      setMobileAdvancedOpen(true);
    }
  }, [filters.period]);

  return (
    <section
      className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-4"
      aria-label="Filtros de transacoes"
      aria-busy={busy}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Funnel className="h-4 w-4" />
          <span>Filtros</span>
          {activeFiltersCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {activeFiltersCount} ativo(s)
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={onClear}
            disabled={busy}
          >
            Limpar filtros
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sm:hidden"
            aria-expanded={mobileAdvancedOpen}
            aria-controls="tx-advanced-filters"
            onClick={() => setMobileAdvancedOpen((previous) => !previous)}
            disabled={busy}
          >
            {mobileAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {mobileAdvancedOpen ? "Ocultar" : "Mais filtros"}
          </Button>
        </div>
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
            className="h-10 rounded-xl border-slate-200/90 bg-white pl-9 dark:border-slate-800 dark:bg-slate-950"
          />
        </div>

        <div
          id="tx-advanced-filters"
          className={cn("space-y-2", !mobileAdvancedOpen ? "hidden sm:block" : "block")}
        >
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
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
              <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
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
                    className="h-10 min-w-[152px] rounded-xl border-slate-200/90 bg-white pr-9 dark:border-slate-800 dark:bg-slate-950"
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
                    className="h-10 min-w-[152px] rounded-xl border-slate-200/90 bg-white pr-9 dark:border-slate-800 dark:bg-slate-950"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
