import { ArrowDownUp, Plus, Search, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Checkbox } from "@/src/components/ui/Checkbox";
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
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-400 dark:hover:text-slate-100"
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
        <TableRow key={`skeleton-${index}`} className="border-slate-200/70 dark:border-slate-800">
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
    "h-11 border-b border-slate-200/70 bg-slate-50/70 px-2 md:px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/70 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/70"
      aria-label="Tabela de transações"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Exibindo <span className="font-semibold text-slate-900 dark:text-slate-100">{visibleCount}</span> de{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{totalCount}</span> transação(ões)
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 sm:hidden">Deslize para ver todas as colunas.</p>
      </div>

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

          {!loading && items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="py-14 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Nenhuma transação encontrada
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ajuste os filtros ou faça um novo lançamento.
                </p>
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
              </TableCell>
            </TableRow>
          ) : null}

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
    </section>
  );
}
