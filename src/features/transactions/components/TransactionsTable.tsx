import React from "react";
import { format } from "date-fns";
import { ArrowDownUp, MoreHorizontal, Plus, Search, Tag, Trash2, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { Skeleton } from "@/src/components/ui/Skeleton";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Checkbox } from "@/src/components/ui/Checkbox";
import { CategoryPill } from "@/src/components/ui/CategoryPill";
import { Menu } from "@/src/components/ui/Menu";
import type { Suggestion } from "@/src/features/categorization/suggestCategory";
import { TransactionRow } from "@/src/features/transactions/components/TransactionRow";

type SortField = "date" | "amount";
type SortDirection = "asc" | "desc";

type TransactionsTableProps = {
  items: TransactionDTO[];
  categories: CategoryDTO[];
  selectedIds: string[];
  suggestionsById: Map<string, Suggestion>;
  applyingSuggestionId?: string | null;
  loading?: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  totalCount: number;
  visibleCount: number;
  onToggleSort: (field: SortField) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onApplySuggestion?: (transaction: TransactionDTO, suggestion: Suggestion) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  onClearFilters: () => void;
  onCreateTransaction?: () => void;
  onImportStatement?: () => void;
};

const amountFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function SortButton({
  label,
  field,
  sortField,
  sortDirection,
  onToggleSort
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggleSort: (field: SortField) => void;
}): React.JSX.Element {
  const active = sortField === field;
  const directionLabel = active ? (sortDirection === "asc" ? "crescente" : "decrescente") : "não ordenado";

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-muted-foreground/80 dark:hover:text-foreground"
      onClick={() => onToggleSort(field)}
      aria-label={`Ordenar por ${label} (${directionLabel})`}
    >
      <span>{label}</span>
      <ArrowDownUp className="h-3.5 w-3.5" />
    </button>
  );
}

function LoadingRows(): React.JSX.Element {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <TableRow key={`skeleton-${index}`} className="border-border/70">
          <TableCell className="w-9 py-3 pl-2 pr-1 md:w-11 md:pr-2">
            <Skeleton className="h-4 w-4 rounded-full" />
          </TableCell>
          <TableCell className="min-w-[140px] py-3 px-2 md:min-w-[240px] md:px-4">
            <Skeleton className="h-4 w-32 md:w-44" />
          </TableCell>
          <TableCell className="hidden min-w-[120px] py-3 px-2 sm:table-cell md:min-w-[220px] md:px-4">
            <Skeleton className="h-5 w-24 rounded-full md:w-32" />
          </TableCell>
          <TableCell className="hidden py-3 md:table-cell">
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell className="hidden py-3 md:table-cell">
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="min-w-[112px] py-3 px-2 text-right md:min-w-[148px] md:px-4">
            <Skeleton className="ml-auto h-4 w-20" />
          </TableCell>
          <TableCell className="hidden py-3 text-right md:table-cell">
            <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function MobileLoadingCards(): React.JSX.Element {
  return (
    <div className="space-y-3 px-3 pb-3 md:hidden">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`mobile-skeleton-${index}`} className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-1 h-4 w-4 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTransactionDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return format(parsed, "dd/MM/yyyy");
}

function MobileTransactionCard({
  transaction,
  categories,
  checked,
  suggestion,
  applyingSuggestion = false,
  onToggleSelect,
  onCategoryChange,
  onApplySuggestion,
  onDelete,
  onEdit
}: {
  transaction: TransactionDTO;
  categories: CategoryDTO[];
  checked: boolean;
  suggestion?: Suggestion;
  applyingSuggestion?: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onApplySuggestion?: (transaction: TransactionDTO, suggestion: Suggestion) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}): React.JSX.Element {
  const [showCategorySelect, setShowCategorySelect] = React.useState(false);
  const categorySelectRef = React.useRef<HTMLSelectElement | null>(null);
  const isTransfer = transaction.type === "transfer";
  const categoryName = isTransfer ? "Transferência" : transaction.category?.name ?? "Sem categoria";
  const statusLabel =
    transaction.type === "income"
      ? "Receita"
      : transaction.type === "expense"
        ? "Despesa"
        : transaction.isInternalTransfer
          ? "Transferência interna"
          : "Transferência";
  const amount = `${transaction.amount < 0 ? "-" : "+"} ${amountFormatter.format(Math.abs(transaction.amount))}`;
  const amountClassName =
    transaction.amount >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300";
  const actionMenuItems = [
    ...(!isTransfer
      ? [
          {
            key: "edit",
            label: "Editar transação",
            icon: <ArrowDownUp className="h-4 w-4" />,
            onSelect: () => onEdit?.(transaction.id)
          },
          {
            key: "change-category",
            label: "Alterar categoria",
            icon: <Tag className="h-4 w-4" />,
            onSelect: () => setShowCategorySelect(true)
          }
        ]
      : []),
    {
      key: "delete",
      label: "Excluir",
      icon: <Trash2 className="h-4 w-4" />,
      tone: "danger" as const,
      onSelect: () => onDelete(transaction.id)
    }
  ];

  React.useEffect(() => {
    if (!showCategorySelect) return;
    categorySelectRef.current?.focus();
  }, [showCategorySelect]);

  return (
    <article className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={checked}
          onChange={(event) => onToggleSelect(transaction.id, Boolean(event.target.checked))}
          aria-label={
            checked
              ? `Desmarcar transação ${transaction.description}`
              : `Selecionar transação ${transaction.description}`
          }
          className="mt-1"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{transaction.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatTransactionDate(transaction.date)} • {transaction.account.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
            </div>

            <div className="flex shrink-0 items-start gap-1.5">
              <p className={`text-sm font-extrabold ${amountClassName}`}>{amount}</p>
              <Menu
                trigger={<MoreHorizontal className="h-4 w-4" />}
                triggerAriaLabel={`Ações da transação ${transaction.description}`}
                items={actionMenuItems}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CategoryPill name={categoryName} size="sm" className="font-semibold" />
            {suggestion ? (
              <span
                className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary dark:border-primary/40 dark:bg-primary/20 dark:text-primary-foreground"
                title={suggestion.reason}
              >
                Sugestão • {Math.round(suggestion.confidence * 100)}%
              </span>
            ) : null}
          </div>

          {suggestion && onApplySuggestion ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg px-3 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary dark:text-primary-foreground dark:hover:bg-primary/25 dark:hover:text-primary-foreground"
              onClick={() => onApplySuggestion(transaction, suggestion)}
              isLoading={applyingSuggestion}
              disabled={applyingSuggestion}
            >
              Aplicar sugestão
            </Button>
          ) : null}

          {showCategorySelect && !isTransfer ? (
            <select
              ref={categorySelectRef}
              aria-label={`Selecionar categoria para ${transaction.description}`}
              value={transaction.categoryId ?? ""}
              onChange={(event) => {
                onCategoryChange(transaction.id, event.target.value || null);
                setShowCategorySelect(false);
              }}
              onBlur={() => setShowCategorySelect(false)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground dark:border-border dark:bg-secondary/60 dark:text-foreground"
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EmptyState({
  onClearFilters,
  onCreateTransaction,
  onImportStatement
}: {
  onClearFilters: () => void;
  onCreateTransaction?: () => void;
  onImportStatement?: () => void;
}): React.JSX.Element {
  return (
    <div className="px-4 py-10 text-center" data-testid="transactions-table-empty">
      <Search className="mx-auto h-8 w-8 text-muted-foreground/80" />
      <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma transação encontrada</p>
      <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou faça um novo lançamento.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onCreateTransaction ? (
          <Button type="button" size="sm" onClick={onCreateTransaction}>
            <Plus className="h-4 w-4" />
            Nova
          </Button>
        ) : null}
        {onImportStatement ? (
          <Button type="button" size="sm" variant="outline" onClick={onImportStatement}>
            <Upload className="h-4 w-4" />
            Importar extrato
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
          Limpar filtros
        </Button>
      </div>
    </div>
  );
}

export function TransactionsTable({
  items,
  categories,
  selectedIds,
  suggestionsById,
  applyingSuggestionId = null,
  loading = false,
  sortField,
  sortDirection,
  totalCount,
  visibleCount,
  onToggleSort,
  onToggleSelectAll,
  onToggleSelect,
  onCategoryChange,
  onApplySuggestion,
  onDelete,
  onEdit,
  onClearFilters,
  onCreateTransaction,
  onImportStatement
}: TransactionsTableProps): React.JSX.Element {
  const selectedIdsSet = new Set(selectedIds);
  const allSelected = items.length > 0 && items.every((item) => selectedIdsSet.has(item.id));
  const someSelected = !allSelected && items.some((item) => selectedIdsSet.has(item.id));
  const headerClassName =
    "h-11 border-b border-border/70 bg-secondary/50 px-2 md:px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground dark:border-border dark:bg-secondary/45 dark:text-muted-foreground/80";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-secondary/60 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-border dark:from-card dark:via-card dark:to-secondary/70"
      aria-label="Tabela de transações"
      data-testid="transactions-table"
    >
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 dark:border-border lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          Exibindo <span className="font-semibold text-foreground">{visibleCount}</span> de{" "}
          <span className="font-semibold text-foreground">{totalCount}</span> transação(ões)
        </p>
        <p className="text-xs text-muted-foreground sm:hidden">Deslize para ver todas as colunas.</p>
      </div>

      {loading ? <MobileLoadingCards /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          onClearFilters={onClearFilters}
          onCreateTransaction={onCreateTransaction}
          onImportStatement={onImportStatement}
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="space-y-3 px-3 pb-3 md:hidden">
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/35 px-3 py-2 text-xs text-muted-foreground">
            <span>Selecione e gerencie lançamentos no celular.</span>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={(event) => onToggleSelectAll(Boolean(event.target.checked))}
              aria-label={
                allSelected
                  ? "Desmarcar todas as transações filtradas"
                  : "Selecionar todas as transações filtradas"
              }
            />
          </div>

          {items.map((transaction) => (
            <MobileTransactionCard
              key={`mobile-${transaction.id}`}
              transaction={transaction}
              categories={categories}
              checked={selectedIdsSet.has(transaction.id)}
              suggestion={suggestionsById.get(transaction.id)}
              applyingSuggestion={applyingSuggestionId === transaction.id}
              onToggleSelect={onToggleSelect}
              onCategoryChange={onCategoryChange}
              onApplySuggestion={onApplySuggestion}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}

      <div className="hidden md:block">
        <Table
          className="min-w-[920px]"
          containerClassName="max-h-[70vh] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
        >
          <TableHeader className="sticky top-0 z-10 backdrop-blur">
            <TableRow>
              <TableHead className={`w-9 pr-1 md:w-11 md:pr-2 ${headerClassName}`}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={(event) => onToggleSelectAll(Boolean(event.target.checked))}
                  aria-label={
                    allSelected
                      ? "Desmarcar todas as transações filtradas"
                      : "Selecionar todas as transações filtradas"
                  }
                />
              </TableHead>
              <TableHead className={headerClassName}>Descrição</TableHead>
              <TableHead className={`hidden sm:table-cell ${headerClassName}`}>Categoria</TableHead>
              <TableHead className={`hidden md:table-cell ${headerClassName}`}>Conta</TableHead>
              <TableHead className={`hidden md:table-cell ${headerClassName}`}>
                <SortButton
                  label="Data"
                  field="date"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onToggleSort={onToggleSort}
                />
              </TableHead>
              <TableHead className={`w-[112px] md:w-[148px] text-right ${headerClassName}`}>
                <div className="flex justify-end">
                  <SortButton
                    label="Valor"
                    field="amount"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onToggleSort={onToggleSort}
                  />
                </div>
              </TableHead>
              <TableHead className={`hidden md:table-cell w-[96px] text-right ${headerClassName}`}>Ação</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? <LoadingRows /> : null}

            {!loading
              ? items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    categories={categories}
                    checked={selectedIdsSet.has(transaction.id)}
                    suggestion={suggestionsById.get(transaction.id)}
                    applyingSuggestion={applyingSuggestionId === transaction.id}
                    onToggleSelect={onToggleSelect}
                    onCategoryChange={onCategoryChange}
                    onApplySuggestion={onApplySuggestion}
                    onDelete={onDelete}
                    onEdit={onEdit}
                  />
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
