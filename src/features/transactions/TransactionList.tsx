"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { formatMoney } from "@/lib/money";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";

type TransactionSummary = {
  income: number;
  expense: number;
  balance: number;
};

type TransactionPagination = {
  page: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type TransactionListProps = {
  items: TransactionDTO[];
  categories: CategoryDTO[];
  selectedIds: string[];
  summary: TransactionSummary;
  pagination: TransactionPagination;
  loading?: boolean;
  bulkDeleting?: boolean;
  actionError?: string;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onDelete: (id: string) => void;
  onDeleteSelected: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function TransactionList({
  items,
  categories,
  selectedIds,
  summary,
  pagination,
  loading = false,
  bulkDeleting = false,
  actionError,
  onToggleSelectAll,
  onToggleSelect,
  onCategoryChange,
  onDelete,
  onDeleteSelected,
  onPreviousPage,
  onNextPage
}: TransactionListProps): React.JSX.Element {
  return (
    <section className="space-y-4" aria-label="Lista de transacoes">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="text-muted-foreground" role="status" aria-live="polite">
            Mostrando {items.length} de {pagination.totalCount} transacoes
          </div>
          <div className="flex items-center gap-4">
            <span className="font-medium text-emerald-600">+ {formatMoney(summary.income)}</span>
            <span className="font-medium text-rose-600">- {formatMoney(summary.expense)}</span>
            <span className="font-semibold">{formatMoney(summary.balance)}</span>
          </div>
        </CardContent>
      </Card>

      <TransactionsTable
        items={items}
        categories={categories}
        selectedIds={selectedIds}
        onToggleSelectAll={onToggleSelectAll}
        onToggleSelect={onToggleSelect}
        onCategoryChange={onCategoryChange}
        onDelete={onDelete}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {selectedIds.length > 0 ? `${selectedIds.length} selecionada(s)` : "Nenhuma selecionada"}
        </div>
        <Button
          variant="danger"
          className="w-full sm:w-auto"
          disabled={selectedIds.length === 0 || bulkDeleting || loading}
          isLoading={bulkDeleting}
          onClick={onDeleteSelected}
        >
          {bulkDeleting ? "Excluindo..." : "Excluir selecionadas"}
        </Button>
      </div>

      {actionError ? <FeedbackMessage variant="error">{actionError}</FeedbackMessage> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Pagina {pagination.page} de {pagination.totalPages}
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={!pagination.hasPreviousPage || loading}
            onClick={onPreviousPage}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={!pagination.hasNextPage || loading}
            onClick={onNextPage}
          >
            Proxima
          </Button>
        </div>
      </div>
    </section>
  );
}

