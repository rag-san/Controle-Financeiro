"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { AccountDTO, CategoryDTO, TransactionDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { CsvImportPanel } from "@/src/features/transactions/CsvImportPanel";
import {
  type NewTransactionDraft,
  TransactionForm
} from "@/src/features/transactions/TransactionForm";
import {
  TransactionFilters,
  type TransactionFiltersState
} from "@/src/features/transactions/TransactionFilters";
import { TransactionList } from "@/src/features/transactions/TransactionList";
import { useToast } from "@/src/components/ui/ToastProvider";

type TransactionResponse = {
  items: TransactionDTO[];
  summary: {
    income: number;
    expense: number;
    balance: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta?: {
    accounts: AccountDTO[];
    categories: CategoryDTO[];
  };
};

const initialFilters: TransactionFiltersState = {
  period: "all",
  accountId: "",
  type: "",
  categoryId: "",
  q: ""
};

const initialDraft: NewTransactionDraft = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  accountId: "",
  categoryId: ""
};

export default function TransactionsPage(): React.JSX.Element {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [filters, setFilters] = useState<TransactionFiltersState>(initialFilters);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });
  const [loading, setLoading] = useState(true);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState("");
  const [createError, setCreateError] = useState("");
  const shouldLoadMetaRef = useRef(true);
  const [newTx, setNewTx] = useState<NewTransactionDraft>(initialDraft);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(filters.q.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.q]);

  useEffect(() => {
    if (!showCreate) return;

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowCreate(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showCreate]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", filters.period);
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.type) params.set("type", filters.type);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedQuery) params.set("q", debouncedQuery);
    return params.toString();
  }, [debouncedQuery, filters.accountId, filters.categoryId, filters.period, filters.type, page, pageSize]);

  const loadTransactions = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      try {
        const includeMeta = shouldLoadMetaRef.current ? "&includeMeta=1" : "";
        const response = await fetch(`/api/transactions?${queryString}${includeMeta}`, { signal });
        const { data, errorMessage } = await parseApiResponse<TransactionResponse | { error?: unknown }>(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !data || !("items" in data)) {
          throw new Error(extractApiError(data, "Nao foi possivel carregar transacoes."));
        }

        setTransactions(data.items);
        setSummary(data.summary);
        setPagination(data.pagination);
        setActionError("");

        if (data.meta) {
          setAccounts(data.meta.accounts);
          setCategories(data.meta.categories);
          setNewTx((previous) => {
            if (previous.accountId || !data.meta?.accounts[0]) {
              return previous;
            }
            return { ...previous, accountId: data.meta.accounts[0].id };
          });
          shouldLoadMetaRef.current = false;
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const message = error instanceof Error ? error.message : "Falha ao carregar transacoes.";
          setActionError(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    setPage(1);
  }, [filters.accountId, filters.categoryId, filters.period, filters.type, debouncedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTransactions(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadTransactions]);

  useEffect(() => {
    setSelectedIds([]);
  }, [transactions]);

  const handleCreate = async (): Promise<void> => {
    const trimmedDescription = newTx.description.trim();
    if (!trimmedDescription || !newTx.amount.trim() || !newTx.accountId) {
      const message = "Preencha descricao, valor e conta para criar uma transacao.";
      setCreateError(message);
      toast({ variant: "error", title: "Campos obrigatorios", description: message });
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: newTx.date,
          description: trimmedDescription,
          amount: Number(newTx.amount),
          accountId: newTx.accountId,
          categoryId: newTx.categoryId || null
        })
      });
      const { data, errorMessage } = await parseApiResponse<TransactionDTO | { error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data || !("id" in data)) {
        throw new Error(extractApiError(data, "Falha ao criar transacao."));
      }

      setNewTx((previous) => ({ ...previous, description: "", amount: "", categoryId: "" }));
      setShowCreate(false);
      await loadTransactions();
      toast({ variant: "success", title: "Transacao criada", description: "A lista foi atualizada." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao criar transacao.";
      setCreateError(message);
      toast({ variant: "error", title: "Erro ao criar transacao", description: message });
    } finally {
      setCreating(false);
    }
  };

  const handleCategoryChange = async (transactionId: string, categoryId: string | null): Promise<void> => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId })
      });
      const { data, errorMessage } = await parseApiResponse<TransactionDTO | { error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data || !("id" in data)) {
        throw new Error(extractApiError(data, "Falha ao atualizar categoria."));
      }

      await loadTransactions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar categoria.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao atualizar categoria", description: message });
    }
  };

  const handleDelete = async (transactionId: string): Promise<void> => {
    setActionError("");
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, { method: "DELETE" });
      const { data, errorMessage } = await parseApiResponse<{ success?: boolean; error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data?.success) {
        throw new Error(extractApiError(data, "Falha ao excluir transacao."));
      }

      await loadTransactions();
      toast({ variant: "success", title: "Transacao excluida", description: "Lancamento removido com sucesso." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir transacao.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao excluir transacao", description: message });
    }
  };

  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedIds.length === 0 || bulkDeleting) return;

    const ids = [...new Set(selectedIds)];
    const confirmed = window.confirm(`Excluir ${ids.length} transacao(oes) selecionada(s)?`);
    if (!confirmed) return;

    setBulkDeleting(true);
    setActionError("");
    try {
      const response = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });

      const { data, errorMessage } = await parseApiResponse<
        | {
            success: boolean;
            requestedCount: number;
            deletedCount: number;
          }
        | {
            error?: unknown;
          }
      >(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data || !("success" in data)) {
        throw new Error(extractApiError(data, "Falha ao excluir transacoes selecionadas."));
      }

      setSelectedIds([]);
      await loadTransactions();
      toast({
        variant: "success",
        title: "Exclusao concluida",
        description: `${data.deletedCount} transacao(oes) removida(s).`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir transacoes selecionadas.";
      setActionError(message);
      toast({ variant: "error", title: "Erro na exclusao em massa", description: message });
    } finally {
      setBulkDeleting(false);
    }
  };

  const refreshMetaAndData = async (): Promise<void> => {
    shouldLoadMetaRef.current = true;
    await loadTransactions();
  };

  const actions = (
    <>
      <Button variant="outline" onClick={() => setShowCreate((prev) => !prev)} className="flex-1 sm:flex-none">
        <Plus className="h-4 w-4" />
        {showCreate ? "Fechar" : "Nova"}
      </Button>
      <Button onClick={() => setShowImport((prev) => !prev)} className="flex-1 sm:flex-none">
        <Upload className="h-4 w-4" />
        {showImport ? "Fechar importacao" : "Importar"}
      </Button>
    </>
  );

  return (
    <PageShell title="Transacoes" subtitle="Lancamentos, filtros e categorizacao manual" actions={actions}>
      <div className="space-y-4">
        <CsvImportPanel
          open={showImport}
          accounts={accounts}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            void loadTransactions();
          }}
          onAccountsRefresh={() => refreshMetaAndData()}
        />

        {showCreate ? (
          <TransactionForm
            values={newTx}
            accounts={accounts}
            categories={categories}
            busy={creating}
            error={createError}
            onChange={(next) => setNewTx((previous) => ({ ...previous, ...next }))}
            onSubmit={() => handleCreate()}
            onCancel={() => setShowCreate(false)}
          />
        ) : null}

        <TransactionFilters
          filters={filters}
          accounts={accounts}
          categories={categories}
          busy={loading}
          onChange={(next) => setFilters((previous) => ({ ...previous, ...next }))}
          onClear={() => setFilters(initialFilters)}
        />

        {loading ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <TransactionList
            items={transactions}
            categories={categories}
            selectedIds={selectedIds}
            summary={summary}
            pagination={pagination}
            loading={loading}
            bulkDeleting={bulkDeleting}
            actionError={actionError}
            onToggleSelectAll={(checked) =>
              setSelectedIds(checked ? transactions.map((transaction) => transaction.id) : [])
            }
            onToggleSelect={(id, checked) =>
              setSelectedIds((previous) => {
                if (checked) {
                  return previous.includes(id) ? previous : [...previous, id];
                }
                return previous.filter((item) => item !== id);
              })
            }
            onCategoryChange={(id, categoryId) => void handleCategoryChange(id, categoryId)}
            onDelete={(id) => void handleDelete(id)}
            onDeleteSelected={() => void handleDeleteSelected()}
            onPreviousPage={() => setPage((previous) => Math.max(previous - 1, 1))}
            onNextPage={() => setPage((previous) => previous + 1)}
          />
        )}
      </div>
    </PageShell>
  );
}
