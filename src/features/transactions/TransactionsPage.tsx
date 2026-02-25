"use client";

import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { Plus, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImportTransactionsModal } from "@/components/import/ImportTransactionsModal";
import { PageShell } from "@/components/layout/PageShell";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { AccountDTO, CategoryDTO, TransactionDTO } from "@/lib/types";
import {
  getMappings,
  removeMapping,
  setMapping
} from "@/src/features/categorization/mappingsStore";
import { extractMerchantKey, normalizeText } from "@/src/features/categorization/normalizeMerchant";
import { buildCategoryRules } from "@/src/features/categorization/rules";
import {
  buildSuggestionContext,
  isTransactionUncategorized,
  suggestCategory,
  type Suggestion
} from "@/src/features/categorization/suggestCategory";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { useToast } from "@/src/components/ui/ToastProvider";
import { buildInsights } from "@/src/features/insights/buildInsights";
import { InsightsBanner } from "@/src/features/insights/components/InsightsBanner";
import { buildPeriodComparison } from "@/src/features/insights/utils/period";
import { BulkActionsBar } from "@/src/features/transactions/components/BulkActionsBar";
import { BulkCategoryModal } from "@/src/features/transactions/components/BulkCategoryModal";
import { BulkDeleteModal } from "@/src/features/transactions/components/BulkDeleteModal";
import {
  type NewTransactionDraft,
  TransactionForm
} from "@/src/features/transactions/TransactionForm";
import {
  type TransactionsFiltersState,
  TransactionsFiltersBar
} from "@/src/features/transactions/components/TransactionsFiltersBar";
import { TransactionsKpiCards } from "@/src/features/transactions/components/TransactionsKpiCards";
import { TransactionsTable } from "@/src/features/transactions/components/TransactionsTable";
import { useSelection } from "@/src/features/transactions/hooks/useSelection";

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

type SortState = {
  field: "date" | "amount";
  direction: "asc" | "desc";
};

const initialFilters: TransactionsFiltersState = {
  period: "30d",
  accountId: "",
  type: "",
  categoryId: "",
  from: "",
  to: ""
};

const initialDraft: NewTransactionDraft = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  accountId: "",
  categoryId: ""
};

function formatDateToInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfDayIso(dateInput: string): string {
  return `${dateInput}T23:59:59.999`;
}

function escapeCsvValue(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void
): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
  const errors: string[] = [];
  let cursor = 0;
  let successCount = 0;
  let done = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      try {
        await worker(items[index], index);
        successCount += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Erro desconhecido");
      } finally {
        done += 1;
        onProgress?.(done, items.length);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => runWorker())
  );

  return {
    successCount,
    failureCount: items.length - successCount,
    errors
  };
}

function resolvePeriodQuery(filters: TransactionsFiltersState): {
  period: "all" | "30d" | "current-month" | "custom";
  from?: string;
  to?: string;
} {
  if (filters.period === "all") {
    return { period: "all" };
  }

  if (filters.period === "30d") {
    return { period: "30d" };
  }

  if (filters.period === "this-month") {
    return { period: "current-month" };
  }

  if (filters.period === "7d") {
    const to = new Date();
    const from = subDays(to, 7);
    return {
      period: "custom",
      from: formatDateToInput(from),
      to: endOfDayIso(formatDateToInput(to))
    };
  }

  if (filters.period === "90d") {
    const to = new Date();
    const from = subDays(to, 90);
    return {
      period: "custom",
      from: formatDateToInput(from),
      to: endOfDayIso(formatDateToInput(to))
    };
  }

  if (filters.period === "last-month") {
    const reference = subMonths(new Date(), 1);
    const from = startOfMonth(reference);
    const to = endOfMonth(reference);
    return {
      period: "custom",
      from: formatDateToInput(from),
      to: endOfDayIso(formatDateToInput(to))
    };
  }

  if (filters.period === "custom" && (filters.from || filters.to)) {
    return {
      period: "custom",
      from: filters.from || undefined,
      to: filters.to ? endOfDayIso(filters.to) : undefined
    };
  }

  return { period: "all" };
}

function resolveTypeFromQuery(value: string | null): TransactionsFiltersState["type"] {
  if (value === "income" || value === "expense" || value === "transfer") {
    return value;
  }
  return "";
}

function resolvePeriodFromQuery(value: string | null): TransactionsFiltersState["period"] | null {
  if (!value) return null;
  if (value === "current-month") return "this-month";
  if (
    value === "7d" ||
    value === "30d" ||
    value === "90d" ||
    value === "this-month" ||
    value === "last-month" ||
    value === "custom" ||
    value === "all"
  ) {
    return value;
  }
  return null;
}

function formatPeriodDateLabel(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "dd/MM/yyyy");
}

function resolveTransactionsPeriodLabel(filters: Pick<TransactionsFiltersState, "period" | "from" | "to">): string {
  if (filters.period === "7d") return "Ultimos 7 dias";
  if (filters.period === "30d") return "Ultimos 30 dias";
  if (filters.period === "90d") return "Ultimos 90 dias";
  if (filters.period === "this-month") return "Este mes";
  if (filters.period === "last-month") return "Mes passado";
  if (filters.period === "all") return "Todo periodo";

  if (filters.period === "custom") {
    const fromLabel = filters.from ? formatPeriodDateLabel(filters.from) : "";
    const toLabel = filters.to ? formatPeriodDateLabel(filters.to) : "";

    if (fromLabel && toLabel) return `${fromLabel} a ${toLabel}`;
    if (fromLabel) return `A partir de ${fromLabel}`;
    if (toLabel) return `Ate ${toLabel}`;
  }

  return "Periodo atual";
}

function isUncategorizedTransaction(transaction: TransactionDTO): boolean {
  if (!transaction.categoryId) {
    return true;
  }
  const categoryName = normalizeText(transaction.category?.name ?? "");
  return categoryName.includes("sem categoria") || categoryName.includes("uncategorized");
}

export function TransactionsPage(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const {
    selectedIds,
    selectedCount,
    selectedSet,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    syncWithAvailableIds
  } = useSelection();
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [filters, setFilters] = useState<TransactionsFiltersState>(initialFilters);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingCategoryQuery, setPendingCategoryQuery] = useState("");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sortState, setSortState] = useState<SortState>({ field: "date", direction: "desc" });
  const [merchantMappings, setMerchantMappings] = useState<Record<string, string>>({});
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
  const [bulkCategorizing, setBulkCategorizing] = useState(false);
  const [bulkApplyingSuggestions, setBulkApplyingSuggestions] = useState(false);
  const [bulkCategoryProgress, setBulkCategoryProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState<string | null>(null);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState("");
  const [createError, setCreateError] = useState("");
  const shouldLoadMetaRef = useRef(true);
  const importButtonRef = useRef<HTMLButtonElement | null>(null);
  const [newTx, setNewTx] = useState<NewTransactionDraft>(initialDraft);
  const isImportOpen = searchParams.get("import") === "1";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryType = resolveTypeFromQuery(params.get("type"));
    const queryPeriod = resolvePeriodFromQuery(params.get("period") ?? params.get("range"));
    const queryCategoryId = params.get("categoryId") ?? "";
    const queryCategoryName = params.get("category") ?? "";
    const queryFrom = params.get("from") ?? "";
    const queryTo = params.get("to") ?? "";
    const querySearch = params.get("q") ?? "";

    setFilters((previous) => ({
      ...previous,
      ...(queryType ? { type: queryType } : {}),
      ...(queryPeriod ? { period: queryPeriod } : {}),
      ...(queryCategoryId ? { categoryId: queryCategoryId } : {}),
      ...(queryFrom ? { from: queryFrom } : {}),
      ...(queryTo ? { to: queryTo } : {})
    }));

    if (querySearch) {
      setSearchQuery(querySearch);
    }

    if (queryCategoryName) {
      if (queryCategoryName.toLowerCase() === "uncategorized") {
        setUncategorizedOnly(true);
      } else {
        setPendingCategoryQuery(queryCategoryName);
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

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

  useEffect(() => {
    setMerchantMappings(getMappings());
  }, []);

  const upsertMerchantMapping = useCallback((merchantKey: string, categoryId: string): void => {
    if (!merchantKey || !categoryId) return;
    setMapping(merchantKey, categoryId);
    setMerchantMappings((previous) => {
      if (previous[merchantKey] === categoryId) {
        return previous;
      }

      return {
        ...previous,
        [merchantKey]: categoryId
      };
    });
  }, []);

  const removeMerchantMapping = useCallback((merchantKey: string): void => {
    if (!merchantKey) return;
    removeMapping(merchantKey);
    setMerchantMappings((previous) => {
      if (!(merchantKey in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[merchantKey];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!pendingCategoryQuery || categories.length === 0) {
      return;
    }

    const normalizedQuery = normalizeText(pendingCategoryQuery);
    const matchedCategory = categories.find((category) => {
      const normalizedCategoryName = normalizeText(category.name);
      return (
        normalizedCategoryName === normalizedQuery || normalizedCategoryName.includes(normalizedQuery)
      );
    });

    if (matchedCategory) {
      setFilters((previous) => ({ ...previous, categoryId: matchedCategory.id }));
      setPendingCategoryQuery("");
    }
  }, [categories, pendingCategoryQuery]);

  useEffect(() => {
    if (filters.categoryId) {
      setUncategorizedOnly(false);
    }
  }, [filters.categoryId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const periodQuery = resolvePeriodQuery(filters);

    params.set("period", periodQuery.period);
    if (periodQuery.from) params.set("from", periodQuery.from);
    if (periodQuery.to) params.set("to", periodQuery.to);

    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.type) params.set("type", filters.type);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedQuery) params.set("q", debouncedQuery);
    return params.toString();
  }, [filters, page, pageSize, debouncedQuery]);

  const loadTransactions = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      try {
        const includeMeta = shouldLoadMetaRef.current ? "&includeMeta=1" : "";
        const response = await fetch(`/api/transactions?${queryString}${includeMeta}`, {
          signal,
          cache: "no-store"
        });
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
  }, [
    filters.period,
    filters.accountId,
    filters.type,
    filters.categoryId,
    filters.from,
    filters.to,
    debouncedQuery
  ]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTransactions(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadTransactions]);

  useEffect(() => {
    if (selectedCount > 0) return;
    setShowBulkCategoryModal(false);
    setShowBulkDeleteModal(false);
  }, [selectedCount]);

  const sortedTransactions = useMemo(() => {
    const ordered = [...transactions];
    const multiplier = sortState.direction === "asc" ? 1 : -1;

    ordered.sort((left, right) => {
      if (sortState.field === "amount") {
        if (left.amount === right.amount) return 0;
        return left.amount > right.amount ? multiplier : -multiplier;
      }

      const leftDate = new Date(left.date).getTime();
      const rightDate = new Date(right.date).getTime();
      if (leftDate === rightDate) return 0;
      return leftDate > rightDate ? multiplier : -multiplier;
    });

    return ordered;
  }, [transactions, sortState]);

  const visibleTransactions = useMemo(() => {
    if (!uncategorizedOnly) {
      return sortedTransactions;
    }

    return sortedTransactions.filter((transaction) => isUncategorizedTransaction(transaction));
  }, [sortedTransactions, uncategorizedOnly]);

  useEffect(() => {
    syncWithAvailableIds(visibleTransactions.map((transaction) => transaction.id));
  }, [syncWithAvailableIds, visibleTransactions]);

  const insightsPeriod = useMemo(
    () =>
      buildPeriodComparison({
        range: filters.period,
        from: filters.from || undefined,
        to: filters.to || undefined,
        referenceDate: new Date()
      }),
    [filters.period, filters.from, filters.to]
  );

  const insights = useMemo(
    () =>
      buildInsights({
        transactions: visibleTransactions,
        categories,
        period: insightsPeriod,
        today: new Date()
      }),
    [visibleTransactions, categories, insightsPeriod]
  );

  const categoryRules = useMemo(() => buildCategoryRules(categories), [categories]);

  const suggestionContext = useMemo(
    () =>
      buildSuggestionContext({
        categories,
        transactions: visibleTransactions,
        mappings: merchantMappings,
        rules: categoryRules
      }),
    [categories, visibleTransactions, merchantMappings, categoryRules]
  );

  const suggestionsById = useMemo(() => {
    const next = new Map<string, Suggestion>();

    for (const transaction of visibleTransactions) {
      if (!isTransactionUncategorized(transaction)) {
        continue;
      }

      const suggestion = suggestCategory(transaction, suggestionContext);
      if (!suggestion) continue;
      if (suggestion.categoryId === transaction.categoryId) continue;
      next.set(transaction.id, suggestion);
    }

    return next;
  }, [visibleTransactions, suggestionContext]);

  const selectedSuggestionEntries = useMemo(
    () =>
      visibleTransactions.flatMap((transaction) => {
        if (!selectedSet.has(transaction.id)) return [];
        const suggestion = suggestionsById.get(transaction.id);
        if (!suggestion) return [];
        return [{ transaction, suggestion }];
      }),
    [selectedSet, visibleTransactions, suggestionsById]
  );

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

  const patchTransactionCategory = useCallback(
    async (transactionId: string, categoryId: string | null): Promise<void> => {
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
    },
    []
  );

  const handleCategoryChange = async (
    transactionId: string,
    categoryId: string | null,
    options?: {
      learnMapping?: boolean;
      showSuccessToast?: boolean;
      successMessage?: string;
    }
  ): Promise<boolean> => {
    const shouldLearn = options?.learnMapping ?? true;

    try {
      await patchTransactionCategory(transactionId, categoryId);

      if (shouldLearn) {
        const transaction = transactions.find((item) => item.id === transactionId);
        if (transaction) {
          const merchantKey = extractMerchantKey(transaction);
          if (categoryId) {
            upsertMerchantMapping(merchantKey, categoryId);
          } else {
            removeMerchantMapping(merchantKey);
          }
        }
      }

      await loadTransactions();

      if (options?.showSuccessToast) {
        toast({
          variant: "success",
          title: "Categoria aplicada",
          description: options.successMessage ?? "Categoria atualizada com sucesso."
        });
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar categoria.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao atualizar categoria", description: message });
      return false;
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

      clearSelection();
      setShowBulkDeleteModal(false);
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

  const handleBulkCategoryApply = async (categoryId: string | null): Promise<void> => {
    if (selectedIds.length === 0 || bulkCategorizing) return;

    const ids = [...new Set(selectedIds)];
    const categoryLabel = categoryId
      ? categories.find((category) => category.id === categoryId)?.name ?? "categoria selecionada"
      : "Sem categoria";

    setBulkCategoryProgress({ done: 0, total: ids.length });
    setBulkCategorizing(true);
    setActionError("");

    try {
      const result = await runWithConcurrency(
        ids,
        4,
        async (transactionId) => {
          await patchTransactionCategory(transactionId, categoryId);
        },
        (done, total) => {
          setBulkCategoryProgress({ done, total });
        }
      );

      if (result.successCount > 0) {
        clearSelection();
        setShowBulkCategoryModal(false);
      }

      await loadTransactions();

      if (result.failureCount === 0) {
        toast({
          variant: "success",
          title: "Categoria aplicada",
          description: `${result.successCount} transacao(oes) atualizada(s) para ${categoryLabel}.`
        });
      } else {
        toast({
          variant: "error",
          title: "Atualizacao parcial",
          description: `${result.successCount} atualizada(s) e ${result.failureCount} com falha.`
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao categorizar transacoes selecionadas.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao categorizar em lote", description: message });
    } finally {
      setBulkCategorizing(false);
      setBulkCategoryProgress(null);
    }
  };

  const handleExportSelected = async (): Promise<void> => {
    if (selectedIds.length === 0 || exportingSelected) return;

    setExportingSelected(true);
    try {
      const rows = visibleTransactions.filter((transaction) => isSelected(transaction.id));

      if (rows.length === 0) {
        toast({
          variant: "info",
          title: "Nada para exportar",
          description: "Nenhuma transacao selecionada no conjunto atual."
        });
        return;
      }

      const csvRows = [
        [
          "Descricao",
          "Categoria",
          "Conta",
          "Data",
          "Valor",
          "Tipo",
          "Status"
        ].join(","),
        ...rows.map((transaction) =>
          [
            transaction.description,
            transaction.category?.name ?? "Sem categoria",
            transaction.account.name,
            format(new Date(transaction.date), "dd/MM/yyyy"),
            transaction.amount.toFixed(2).replace(".", ","),
            transaction.type,
            transaction.status
          ]
            .map((value) => escapeCsvValue(String(value)))
            .join(",")
        )
      ];

      const fileDate = format(new Date(), "yyyy-MM-dd");
      const fileName = `transactions_selected_${rows.length}_${fileDate}.csv`;
      const csvContent = `\uFEFF${csvRows.join("\n")}`;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        variant: "success",
        title: "Exportacao concluida",
        description: `${rows.length} transacao(oes) exportada(s).`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao exportar transacoes selecionadas.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao exportar", description: message });
    } finally {
      setExportingSelected(false);
    }
  };

  const handleApplySuggestion = async (
    transaction: TransactionDTO,
    suggestion: Suggestion
  ): Promise<void> => {
    if (applyingSuggestionId) return;

    setApplyingSuggestionId(transaction.id);
    try {
      const applied = await handleCategoryChange(transaction.id, suggestion.categoryId, {
        learnMapping: false,
        showSuccessToast: true,
        successMessage: `${transaction.description} foi categorizada automaticamente.`
      });

      if (applied) {
        upsertMerchantMapping(suggestion.merchantKey, suggestion.categoryId);
      }
    } finally {
      setApplyingSuggestionId(null);
    }
  };

  const handleApplySuggestionsBulk = async (): Promise<void> => {
    if (selectedSuggestionEntries.length === 0 || bulkApplyingSuggestions) {
      return;
    }

    setBulkApplyingSuggestions(true);
    setActionError("");

    try {
      const successfulMappings: Array<{ merchantKey: string; categoryId: string }> = [];

      const result = await runWithConcurrency(
        selectedSuggestionEntries,
        4,
        async (entry) => {
          await patchTransactionCategory(entry.transaction.id, entry.suggestion.categoryId);
          successfulMappings.push({
            merchantKey: entry.suggestion.merchantKey,
            categoryId: entry.suggestion.categoryId
          });
        }
      );

      if (successfulMappings.length > 0) {
        for (const mapping of successfulMappings) {
          upsertMerchantMapping(mapping.merchantKey, mapping.categoryId);
        }
        clearSelection();
      }

      await loadTransactions();

      if (result.failureCount === 0) {
        toast({
          variant: "success",
          title: "Sugestões aplicadas",
          description: `${result.successCount} transacao(oes) categorizada(s) automaticamente.`
        });
      } else {
        toast({
          variant: "error",
          title: "Aplicação parcial",
          description: `${result.successCount} aplicada(s) e ${result.failureCount} com falha.`
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao aplicar sugestões selecionadas.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao aplicar sugestões", description: message });
    } finally {
      setBulkApplyingSuggestions(false);
    }
  };

  const refreshMetaAndData = async (): Promise<void> => {
    shouldLoadMetaRef.current = true;
    await loadTransactions();
  };

  const clearAllFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery("");
    setPendingCategoryQuery("");
    setUncategorizedOnly(false);
  }, []);

  const setImportModalOpen = useCallback(
    (nextOpen: boolean): void => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextOpen) {
        params.set("import", "1");
      } else {
        params.delete("import");
      }

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const actions = (
    <>
      <Button variant="outline" onClick={() => setShowCreate((prev) => !prev)} className="flex-1 sm:flex-none">
        <Plus className="h-4 w-4" />
        {showCreate ? "Fechar" : "Nova"}
      </Button>
      <Button
        ref={importButtonRef}
        onClick={() => setImportModalOpen(true)}
        className="flex-1 sm:flex-none"
      >
        <Upload className="h-4 w-4" />
        Importar extrato
      </Button>
    </>
  );

  const periodLabel = useMemo(
    () =>
      resolveTransactionsPeriodLabel({
        period: filters.period,
        from: filters.from,
        to: filters.to
      }),
    [filters.period, filters.from, filters.to]
  );

  return (
    <PageShell title="Transações" subtitle="Lancamentos, filtros e categorizacao manual" actions={actions}>
      <ImportTransactionsModal
        open={isImportOpen}
        accounts={accounts}
        triggerRef={importButtonRef}
        onOpenChange={setImportModalOpen}
        onSuccess={async () => {
          await refreshMetaAndData();
          router.refresh();
        }}
        onAccountsRefresh={() => refreshMetaAndData()}
      />
      <div className="space-y-4">
        <TransactionsKpiCards
          income={summary.income}
          expense={summary.expense}
          balance={summary.balance}
          periodLabel={periodLabel}
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

        <TransactionsFiltersBar
          filters={filters}
          accounts={accounts}
          categories={categories}
          searchQuery={searchQuery}
          busy={loading}
          onSearchQueryChange={setSearchQuery}
          onChange={(next) => setFilters((previous) => ({ ...previous, ...next }))}
          onClear={clearAllFilters}
        />

        <InsightsBanner insights={insights} />

        <BulkActionsBar
          selectedCount={selectedCount}
          suggestionCount={selectedSuggestionEntries.length}
          deleting={bulkDeleting}
          categorizing={bulkCategorizing}
          exporting={exportingSelected}
          applyingSuggestions={bulkApplyingSuggestions}
          onClearSelection={clearSelection}
          onDelete={() => setShowBulkDeleteModal(true)}
          onSetCategory={() => setShowBulkCategoryModal(true)}
          onExport={() => void handleExportSelected()}
          onApplySuggestions={() => void handleApplySuggestionsBulk()}
        />

        {actionError ? <FeedbackMessage variant="error">{actionError}</FeedbackMessage> : null}

        <TransactionsTable
          items={visibleTransactions}
          categories={categories}
          selectedIds={selectedIds}
          suggestionsById={suggestionsById}
          applyingSuggestionId={applyingSuggestionId}
          loading={loading}
          sortField={sortState.field}
          sortDirection={sortState.direction}
          totalCount={pagination.totalCount}
          visibleCount={visibleTransactions.length}
          onToggleSort={(field) =>
            setSortState((previous) => {
              if (previous.field === field) {
                return {
                  field,
                  direction: previous.direction === "asc" ? "desc" : "asc"
                };
              }

              return { field, direction: field === "date" ? "desc" : "asc" };
            })
          }
          onToggleSelectAll={(checked) =>
            toggleSelectAll(
              visibleTransactions.map((transaction) => transaction.id),
              checked
            )
          }
          onToggleSelect={(id, checked) => toggleSelection(id, checked)}
          onCategoryChange={(id, categoryId) => void handleCategoryChange(id, categoryId)}
          onApplySuggestion={(transaction, suggestion) => void handleApplySuggestion(transaction, suggestion)}
          onDelete={(id) => void handleDelete(id)}
          onEdit={() => {
            toast({
              variant: "info",
              title: "Edicao em breve",
              description: "A edicao completa da transacao sera disponibilizada nas proximas iteracoes."
            });
          }}
          onClearFilters={clearAllFilters}
          onCreateTransaction={() => setShowCreate(true)}
          onImportStatement={() => setImportModalOpen(true)}
        />

        <BulkCategoryModal
          open={showBulkCategoryModal}
          categories={categories}
          selectedCount={selectedCount}
          busy={bulkCategorizing}
          progress={bulkCategoryProgress}
          onClose={() => {
            if (bulkCategorizing) return;
            setShowBulkCategoryModal(false);
          }}
          onApply={(categoryId) => handleBulkCategoryApply(categoryId)}
        />

        <BulkDeleteModal
          open={showBulkDeleteModal}
          selectedCount={selectedCount}
          busy={bulkDeleting}
          onClose={() => {
            if (bulkDeleting) return;
            setShowBulkDeleteModal(false);
          }}
          onConfirm={() => handleDeleteSelected()}
        />

        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Mostrando <span className="font-semibold text-foreground">{visibleTransactions.length}</span> de{" "}
              <span className="font-semibold text-foreground">{pagination.totalCount}</span> resultado(s)
            </p>
            <p className="text-xs text-muted-foreground">
              Pagina {pagination.page} de {pagination.totalPages}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              disabled={!pagination.hasPreviousPage || loading}
              onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => setPage((previous) => previous + 1)}
            >
              Proxima
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
