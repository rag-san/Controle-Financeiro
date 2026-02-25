import { ArrowDownUp } from "lucide-react";
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
  onToggleSort: (field: SortField) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onApplySuggestion?: (transaction: TransactionDTO, suggestion: Suggestion) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  onClearFilters: () => void;
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
  const directionLabel = active ? (sortDirection === "asc" ? "crescente" : "decrescente") : "nao ordenado";

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <TableRow key={`skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-4 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-36 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-20" />
          </TableCell>
          <TableCell className="text-right">
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
  onToggleSort,
  onToggleSelectAll,
  onToggleSelect,
  onCategoryChange,
  onApplySuggestion,
  onDelete,
  onEdit,
  onClearFilters
}: TransactionsTableProps): React.JSX.Element {
  const selectedIdsSet = new Set(selectedIds);
  const allSelected = items.length > 0 && items.every((item) => selectedIdsSet.has(item.id));
  const someSelected = !allSelected && items.some((item) => selectedIdsSet.has(item.id));

  return (
    <section
      className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
      aria-label="Tabela de transacoes"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          Exibindo <span className="font-semibold text-foreground">{totalCount}</span> transacao(oes)
        </p>
        <p className="text-xs text-muted-foreground sm:hidden">Deslize para os lados para ver todas as colunas.</p>
      </div>

      <Table
        className="min-w-[860px]"
        containerClassName="max-h-[70vh] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
      >
        <TableHeader className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-slate-950/95">
          <TableRow>
            <TableHead className="w-11 pr-2">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(event) => onToggleSelectAll(Boolean(event.target.checked))}
                aria-label={allSelected ? "Desmarcar todas as transacoes filtradas" : "Selecionar todas as transacoes filtradas"}
              />
            </TableHead>
            <TableHead>Descricao</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>
              <SortButton
                label="Data"
                field="date"
                sortField={sortField}
                sortDirection={sortDirection}
                onToggleSort={onToggleSort}
              />
            </TableHead>
            <TableHead className="text-right">
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
            <TableHead className="text-right">Acao</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading ? <LoadingRows /> : null}

          {!loading && items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma transacao encontrada para os filtros atuais.</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-auto px-1 py-0 text-sm text-primary"
                  onClick={onClearFilters}
                >
                  Limpar filtros
                </Button>
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
