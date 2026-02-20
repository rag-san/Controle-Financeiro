"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FiltersRow, type TransactionFilters } from "@/components/transactions/FiltersRow";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { ImportWizard } from "@/components/imports/ImportWizard";
import { parseApiResponse } from "@/lib/client/api-response";
import { formatMoney } from "@/lib/money";
import type { AccountDTO, CategoryDTO, TransactionDTO } from "@/lib/types";

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

const initialFilters: TransactionFilters = {
  period: "all",
  accountId: "",
  type: "",
  categoryId: "",
  q: ""
};

export default function TransactionsPage(): React.JSX.Element {
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);
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
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState("");
  const shouldLoadMetaRef = useRef(true);
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    accountId: "",
    categoryId: ""
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(filters.q.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.q]);

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

  const loadTransactions = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    try {
      const includeMeta = shouldLoadMetaRef.current ? "&includeMeta=1" : "";
      const response = await fetch(`/api/transactions?${queryString}${includeMeta}`, { signal });
      const data = (await response.json()) as TransactionResponse;
      setTransactions(data.items);
      setSummary(data.summary);
      setPagination(data.pagination);
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
        console.error("Falha ao carregar transacoes", error);
      }
    } finally {
      setLoading(false);
    }
  }, [queryString]);

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
    if (!newTx.description || !newTx.amount || !newTx.accountId) return;

    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: newTx.date,
        description: newTx.description,
        amount: Number(newTx.amount),
        accountId: newTx.accountId,
        categoryId: newTx.categoryId || null
      })
    });

    setNewTx((previous) => ({ ...previous, description: "", amount: "", categoryId: "" }));
    setShowCreate(false);
    await loadTransactions();
  };

  const handleCategoryChange = async (transactionId: string, categoryId: string | null): Promise<void> => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId })
    });
    await loadTransactions();
  };

  const handleDelete = async (transactionId: string): Promise<void> => {
    setActionError("");
    await fetch(`/api/transactions/${transactionId}`, { method: "DELETE" });
    await loadTransactions();
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
            error?: string;
          }
      >(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data || !("success" in data)) {
        const apiError =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : null;
        throw new Error(apiError ?? "Falha ao excluir transacoes selecionadas.");
      }

      setSelectedIds([]);
      await loadTransactions();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Falha ao excluir transacoes selecionadas.");
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
        Nova
      </Button>
      <Button onClick={() => setShowImport((prev) => !prev)} className="flex-1 sm:flex-none">
        <Upload className="h-4 w-4" />
        Importar
      </Button>
    </>
  );

  return (
    <PageShell title="Transacoes" subtitle="Lancamentos, filtros e categorizacao manual" actions={actions}>
      <div className="space-y-4">
        {showImport ? (
          <ImportWizard
            accounts={accounts}
            onSuccess={() => void loadTransactions()}
            onAccountsRefresh={() => refreshMetaAndData()}
          />
        ) : null}

        {showCreate ? (
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-5">
              <Input
                type="date"
                value={newTx.date}
                onChange={(event) => setNewTx((prev) => ({ ...prev, date: event.target.value }))}
              />
              <Input
                placeholder="Descricao"
                value={newTx.description}
                onChange={(event) => setNewTx((prev) => ({ ...prev, description: event.target.value }))}
              />
              <Input
                placeholder="Valor"
                type="number"
                value={newTx.amount}
                onChange={(event) => setNewTx((prev) => ({ ...prev, amount: event.target.value }))}
              />
              <Select
                value={newTx.accountId}
                onChange={(event) => setNewTx((prev) => ({ ...prev, accountId: event.target.value }))}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={newTx.categoryId}
                  onChange={(event) => setNewTx((prev) => ({ ...prev, categoryId: event.target.value }))}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
                <Button onClick={() => void handleCreate()} className="w-full sm:w-auto">
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <FiltersRow
          filters={filters}
          accounts={accounts}
          categories={categories}
          onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
          onClear={() => setFilters(initialFilters)}
        />

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="text-muted-foreground">
              Mostrando {transactions.length} de {pagination.totalCount} transacoes
            </div>
            <div className="flex items-center gap-4">
              <span className="font-medium text-emerald-600">+ {formatMoney(summary.income)}</span>
              <span className="font-medium text-rose-600">- {formatMoney(summary.expense)}</span>
              <span className="font-semibold">{formatMoney(summary.balance)}</span>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <TransactionsTable
            items={transactions}
            categories={categories}
            selectedIds={selectedIds}
            onToggleSelectAll={(checked) =>
              setSelectedIds(checked ? transactions.map((transaction) => transaction.id) : [])
            }
            onToggleSelect={(id, checked) =>
              setSelectedIds((prev) => {
                if (checked) {
                  return prev.includes(id) ? prev : [...prev, id];
                }
                return prev.filter((item) => item !== id);
              })
            }
            onCategoryChange={(id, categoryId) => void handleCategoryChange(id, categoryId)}
            onDelete={(id) => void handleDelete(id)}
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedIds.length > 0 ? `${selectedIds.length} selecionada(s)` : "Nenhuma selecionada"}
          </div>
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={selectedIds.length === 0 || bulkDeleting || loading}
            onClick={() => void handleDeleteSelected()}
          >
            {bulkDeleting ? "Excluindo..." : "Excluir selecionadas"}
          </Button>
        </div>

        {actionError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {actionError}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {pagination.page} de {pagination.totalPages}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={!pagination.hasPreviousPage || loading}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Proxima
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
