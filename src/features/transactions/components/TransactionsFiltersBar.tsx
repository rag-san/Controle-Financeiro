import { CalendarDays, Funnel, Search, X } from "lucide-react";
import { useMemo } from "react";
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
  excluded: "included" | "excluded";
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
    <div className={cn("w-full", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border-border/90 bg-card/95 text-sm dark:border-border dark:bg-card/85"
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
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.period !== "this-month") count += 1;
    if (filters.accountId) count += 1;
    if (filters.type) count += 1;
    if (filters.excluded !== "included") count += 1;
    if (filters.categoryId) count += 1;
    if (filters.period === "custom" && filters.from) count += 1;
    if (filters.period === "custom" && filters.to) count += 1;
    return count;
  }, [filters.accountId, filters.categoryId, filters.excluded, filters.from, filters.period, filters.to, filters.type]);

  const canClear = activeFiltersCount > 0 || searchQuery.trim().length > 0;

  return (
    <section
      className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-secondary/60 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.06)] dark:border-border dark:from-card dark:via-card dark:to-secondary/70"
      aria-label="Filtros de transações"
      aria-busy={busy}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Funnel className="h-4 w-4 text-muted-foreground" />
          <span>Filtros</span>
          {activeFiltersCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-secondary/60 dark:text-muted-foreground">
              {activeFiltersCount} ativo(s)
            </span>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          onClick={onClear}
          disabled={busy || !canClear}
        >
          <X className="h-3.5 w-3.5" />
          Limpar filtros
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative min-w-0">
          <label htmlFor="tx-filter-search" className="sr-only">
            Buscar transações
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="tx-filter-search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Buscar descrição ou estabelecimento"
            disabled={busy}
            className="h-10 rounded-xl border-border/90 bg-card pl-9 dark:border-border dark:bg-card/85"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          <FilterSelect
            id="tx-filter-period"
            label="Período"
            value={filters.period}
            onChange={(value) => onChange({ period: value as TransactionsPeriod })}
            disabled={busy}
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="this-month">Este mês</option>
            <option value="last-month">Mês passado</option>
            <option value="all">Todo período</option>
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
            label="Tipo de transação"
            value={filters.type}
            onChange={(value) => onChange({ type: value as TransactionsFiltersState["type"] })}
            disabled={busy}
          >
            <option value="">Todas as transações</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
            <option value="transfer">Transferências</option>
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

          <FilterSelect
            id="tx-filter-excluded"
            label="Excluídos"
            value={filters.excluded}
            onChange={(value) => onChange({ excluded: value as TransactionsFiltersState["excluded"] })}
            disabled={busy}
          >
            <option value="included">Somente incluídos</option>
            <option value="excluded">Somente excluídos</option>
          </FilterSelect>
        </div>

        {filters.period === "custom" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:max-w-[420px]">
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
                className="h-10 rounded-xl border-border/90 bg-card pr-9 dark:border-border dark:bg-card/85"
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
                className="h-10 rounded-xl border-border/90 bg-card pr-9 dark:border-border dark:bg-card/85"
              />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}


