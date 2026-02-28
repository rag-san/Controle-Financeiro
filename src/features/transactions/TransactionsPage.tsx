"use client";

import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { AlertTriangle, Plus, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate as mutateCache } from "swr";
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
  type TransactionsPeriod,
  TransactionsFiltersBar
} from "@/src/features/transactions/components/TransactionsFiltersBar";
import { TransactionsKpiCards } from "@/src/features/transactions/components/TransactionsKpiCards";
import { TransactionsTable } from "@/src/features/transactions/components/TransactionsTable";
import { useSelection } from "@/src/features/transactions/hooks/useSelection";
import { parseSharedFilters, resolveDefaultRange } from "@/src/features/filters/sharedFilters";

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

type TransactionsSortQuery = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const initialDraft: NewTransactionDraft = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  accountId: "",
  categoryId: ""
};

const initialFilters: TransactionsFiltersState = {
  period: "this-month",
  accountId: "",
  type: "",
  excluded: "included",
  categoryId: "",
  from: "",
  to: ""
};

function resolveSortStateFromQuery(value: string | null): SortState {
  if (value === "date_asc") return { field: "date", direction: "asc" };
  if (value === "amount_desc") return { field: "amount", direction: "desc" };
  if (value === "amount_asc") return { field: "amount", direction: "asc" };
  return { field: "date", direction: "desc" };
}

function serializeSortState(sort: SortState): TransactionsSortQuery {
  if (sort.field === "amount") {
    return sort.direction === "asc" ? "amount_asc" : "amount_desc";
  }
  return sort.direction === "asc" ? "date_asc" : "date_desc";
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

function resolvePeriodQuery(filters: TransactionsFiltersState): {
  period: "all" | "7d" | "30d" | "90d" | "last-month" | "current-month" | "custom";
  from?: string;
  to?: string;
} {
  if (filters.period === "all") return { period: "all" };
  if (filters.period === "7d") return { period: "7d" };
  if (filters.period === "30d") return { period: "30d" };
  if (filters.period === "90d") return { period: "90d" };
  if (filters.period === "last-month") return { period: "last-month" };
  if (filters.period === "this-month") return { period: "current-month" };
  return {
    period: "custom",
    from: filters.from || undefined,
    to: filters.to ? endOfDayIso(filters.to) : undefined
  };
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

async function fetchTransactionsResource(url: string): Promise<TransactionResponse> {
  const response = await fetch(url, { cache: "no-store" });
  const { data, errorMessage } = await parseApiResponse<TransactionResponse | { error?: unknown }>(response);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (!response.ok || !data || !("items" in data)) {
    throw new Error(extractApiError(data, "Não foi possível carregar transações."));
  }

  return data;
}

const periodOptions: Record<TransactionsPeriod, { label: string; resolver: (now: Date) => { from: string; to: string } }> = {
  "7d": { label: "Últimos 7 dias", resolver: (now) => rangeDays(now, 7) },
  "30d": { label: "Últimos 30 dias", resolver: (now) => rangeDays(now, 30) },
  "90d": { label: "Últimos 90 dias", resolver: (now) => rangeDays(now, 90) },
  "this-month": { label: "Este mês", resolver: (now) => resolveDefaultRange(now) },
  "last-month": { label: "Mês passado", resolver: (now) => rangeLastMonth(now) },
  custom: { label: "Personalizado", resolver: (now) => resolveDefaultRange(now) },
  all: { label: "Todo período", resolver: (now) => resolveDefaultRange(now) }
};

function rangeDays(reference: Date, days: number): { from: string; to: string } {
  const to = new Date(reference);
  const from = subDays(to, days);
  return { from: formatDateISO(from), to: endOfDayIso(formatDateISO(to)) };
}

function rangeLastMonth(reference: Date): { from: string; to: string } {
  const last = subMonths(reference, 1);
  return {
    from: formatDateISO(startOfMonth(last)),
    to: endOfDayIso(formatDateISO(endOfMonth(last)))
  };
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveTransactionsPeriodLabel(filters: Pick<TransactionsFiltersState, "period" | "from" | "to">): string {
  const option = periodOptions[filters.period];
  if (!option) return "Período atual";
  if (filters.period !== "custom") return option.label;
  const fromLabel = filters.from ? format(new Date(`${filters.from}T00:00:00`), "dd/MM/yyyy") : "";
  const toLabel = filters.to ? format(new Date(`${filters.to}T00:00:00`), "dd/MM/yyyy") : "";
  if (fromLabel && toLabel) return `${fromLabel} a ${toLabel}`;
  if (fromLabel) return `A partir de ${fromLabel}`;
  if (toLabel) return `Até ${toLabel}`;
  return option.label;
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
  const now = useMemo(() => new Date(), []);
  const defaultRange = useMemo(() => resolveDefaultRange(now), [now]);
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
  const [filters, setFilters] = useState<TransactionsFiltersState>({
    period: "this-month",
    accountId: "",
    type: "",
    excluded: "included",
    categoryId: "",
    from: defaultRange.from,
    to: defaultRange.to
  });
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
  const didHydrateQueryRef = useRef(false);
  const skipPageResetRef = useRef(true);
  const importButtonRef = useRef<HTMLButtonElement | null>(null);
  const [newTx, setNewTx] = useState<NewTransactionDraft>(initialDraft);
  const isImportOpen = searchParams.get("import") === "1";
  const isCreateOpen = searchParams.get("new") === "1";
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const manualTransactionAccounts = useMemo(
    () => accounts.filter((account) => account.type !== "credit"),
    [accounts]
  );

  const setQueryFlag = useCallback(
    (key: "new" | "import", nextOpen: boolean): void => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextOpen) {
        params.set(key, "1");
      } else {
        params.delete(key);
      }

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setCreatePanelOpen = useCallback(
    (nextOpen: boolean): void => {
      setShowCreate(nextOpen);
      setQueryFlag("new", nextOpen);
    },
    [setQueryFlag]
  );

  const setImportModalOpen = useCallback(
    (nextOpen: boolean): void => {
      setQueryFlag("import", nextOpen);
    },
    [setQueryFlag]
  );

  useEffect(() => {
    if (didHydrateQueryRef.current) return;

    const parsed = parseSharedFilters(searchParams, now);
    const periodParam = searchParams.get("period") ?? searchParams.get("range");
    const period = resolvePeriodFromQuery(periodParam) ?? "this-month";

    skipPageResetRef.current = true;

    setFilters((previous) => ({
      ...previous,
      period,
      accountId: parsed.accountId,
      type: parsed.type,
      excluded: parsed.excluded,
      categoryId: parsed.categoryId,
      from: parsed.from,
      to: parsed.to
    }));

    if (parsed.q) {
      setSearchQuery(parsed.q);
      setDebouncedQuery(parsed.q.trim());
    }

    const queryPageValue = Number(searchParams.get("page"));
    const querySortState = resolveSortStateFromQuery(searchParams.get("sort"));

    if (Number.isFinite(queryPageValue) && queryPageValue > 0) {
      setPage(Math.floor(queryPageValue));
    }

    setSortState(querySortState);

    const queryCategoryName = searchParams.get("category") ?? "";
    if (queryCategoryName) {
      if (queryCategoryName.toLowerCase() === "uncategorized") {
        setUncategorizedOnly(true);
      } else {
        setPendingCategoryQuery(queryCategoryName);
      }
    }

    didHydrateQueryRef.current = true;
  }, [now, searchParams]);

  useEffect(() => {
    setShowCreate(isCreateOpen);
  }, [isCreateOpen]);

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
        setCreatePanelOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [setCreatePanelOpen, showCreate]);

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
    const sortQuery = serializeSortState(sortState);
    const periodQuery = resolvePeriodQuery(filters);

    params.set("period", periodQuery.period);
    if (periodQuery.from) params.set("from", periodQuery.from);
    if (periodQuery.to) params.set("to", periodQuery.to);
    if (filters.type) params.set("type", filters.type);
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.excluded === "excluded") params.set("excluded", "true");
    if (debouncedQuery) params.set("q", debouncedQuery);

    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sort", sortQuery);
    return params.toString();
  }, [debouncedQuery, filters, page, pageSize, sortState]);

  const {
    data: transactionsResponse,
    error: transactionsError,
    isLoading,
    mutate: mutateTransactions
  } = useSWR(`/api/transactions?${queryString}&includeMeta=1`, fetchTransactionsResource, {
    revalidateOnFocus: false,
    keepPreviousData: true
  });

  const loading = isLoading && !transactionsResponse;

  useEffect(() => {
    if (!transactionsResponse) return;

    setTransactions(transactionsResponse.items);
    setSummary(transactionsResponse.summary);
    setPagination(transactionsResponse.pagination);

    if (transactionsResponse.meta) {
      setAccounts(transactionsResponse.meta.accounts);
      setCategories(transactionsResponse.meta.categories);
    }

    setActionError("");
  }, [transactionsResponse]);

  useEffect(() => {
    if (!transactionsError) return;
    const message = transactionsError instanceof Error ? transactionsError.message : "Falha ao carregar transações.";
    setActionError(message);
  }, [transactionsError]);

  useEffect(() => {
    if (!manualTransactionAccounts.length) return;
    setNewTx((previous) => {
      if (previous.accountId && manualTransactionAccounts.some((account) => account.id === previous.accountId)) {
        return previous;
      }
      return { ...previous, accountId: manualTransactionAccounts[0].id };
    });
  }, [manualTransactionAccounts]);

  useEffect(() => {
    if (skipPageResetRef.current) {
      skipPageResetRef.current = false;
      return;
    }

    setPage(1);
  }, [
    debouncedQuery,
    filters.accountId,
    filters.categoryId,
    filters.excluded,
    filters.from,
    filters.period,
    filters.to,
    filters.type,
    sortState.direction,
    sortState.field
  ]);

  useEffect(() => {
    if (!didHydrateQueryRef.current) return;

    const params = new URLSearchParams(searchParams.toString());
    const periodQuery = resolvePeriodQuery(filters);
    const sortQuery = serializeSortState(sortState);
    const fromValue = periodQuery.from ? periodQuery.from.slice(0, 10) : "";
    const toValue = periodQuery.to ? periodQuery.to.slice(0, 10) : "";

    params.set("period", periodQuery.period);

    if (fromValue) params.set("from", fromValue);
    else params.delete("from");

    if (toValue) params.set("to", toValue);
    else params.delete("to");

    if (filters.accountId) params.set("accountId", filters.accountId);
    else params.delete("accountId");

    if (filters.type) params.set("type", filters.type);
    else params.delete("type");

    if (filters.excluded === "included") params.set("excluded", "false");
    else if (filters.excluded === "excluded") params.set("excluded", "true");
    else params.delete("excluded");

    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    else params.delete("categoryId");

    if (debouncedQuery) params.set("q", debouncedQuery);
    else params.delete("q");

    if (sortQuery !== "date_desc") params.set("sort", sortQuery);
    else params.delete("sort");

    if (page > 1) params.set("page", String(page));
    else params.delete("page");

    params.delete("range");
    if (!uncategorizedOnly) {
      params.delete("category");
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [
    debouncedQuery,
    filters,
    page,
    pathname,
    router,
    searchParams,
    sortState,
    uncategorizedOnly
  ]);

  const loadTransactions = useCallback(async (): Promise<void> => {
    await mutateTransactions();
  }, [mutateTransactions]);

  const refreshFinanceData = useCallback(async (): Promise<void> => {
    await loadTransactions();
    await Promise.all([
      mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/dashboard/"),
        undefined,
        { revalidate: true }
      ),
      mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/metrics/official"),
        undefined,
        { revalidate: true }
      ),
      mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/accounts"),
        undefined,
        { revalidate: true }
      ),
      mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/net-worth"),
        undefined,
        { revalidate: true }
      ),
      mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/reports"),
        undefined,
        { revalidate: true }
      ),
      mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/reconcile/review"),
        undefined,
        { revalidate: true }
      )
    ]);
  }, [loadTransactions]);

  const refreshFinanceDataAndRoute = useCallback(async (): Promise<void> => {
    await refreshFinanceData();
    router.refresh();
  }, [refreshFinanceData, router]);

  useEffect(() => {
    if (selectedCount > 0) return;
    setShowBulkCategoryModal(false);
    setShowBulkDeleteModal(false);
  }, [selectedCount]);

  const visibleTransactions = useMemo(() => {
    if (!uncategorizedOnly) {
      return transactions;
    }

    return transactions.filter((transaction) => isUncategorizedTransaction(transaction));
  }, [transactions, uncategorizedOnly]);

  const uncategorizedStats = useMemo(() => {
    const total = transactions.length;
    const count = transactions.filter((transaction) => isUncategorizedTransaction(transaction)).length;

    return {
      total,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    };
  }, [transactions]);

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
    const selectedAccount = accountById.get(newTx.accountId);

    if (!trimmedDescription || !newTx.amount.trim() || !newTx.accountId) {
      const message = "Preencha descrição, valor e conta para criar uma transação.";
      setCreateError(message);
      toast({ variant: "error", title: "Campos obrigatórios", description: message });
      return;
    }
    if (!selectedAccount || selectedAccount.type === "credit") {
      const message = "Selecione uma conta corrente/caixa/investimento. Conta de cartão aceita apenas fatura/transferência.";
      setCreateError(message);
      toast({ variant: "error", title: "Conta inválida", description: message });
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
        throw new Error(extractApiError(data, "Falha ao criar transação."));
      }

      setNewTx((previous) => ({ ...previous, description: "", amount: "", categoryId: "" }));
      setCreatePanelOpen(false);
      await refreshFinanceData();
      toast({ variant: "success", title: "Transação criada", description: "A lista foi atualizada." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao criar transação.";
      setCreateError(message);
      toast({ variant: "error", title: "Erro ao criar transação", description: message });
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

      await refreshFinanceData();

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
        throw new Error(extractApiError(data, "Falha ao excluir transação."));
      }

      await refreshFinanceDataAndRoute();
      toast({ variant: "success", title: "Transação excluída", description: "Lançamento removido com sucesso." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir transação.";
      setActionError(message);
      toast({ variant: "error", title: "Erro ao excluir transação", description: message });
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
        throw new Error(extractApiError(data, "Falha ao excluir transações selecionadas."));
      }

      clearSelection();
      setShowBulkDeleteModal(false);
      await refreshFinanceDataAndRoute();
      toast({
        variant: "success",
        title: "Exclusão concluída",
        description: `${data.deletedCount} transação(ões) removida(s).`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir transações selecionadas.";
      setActionError(message);
      toast({ variant: "error", title: "Erro na exclusão em massa", description: message });
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

      await refreshFinanceData();

      if (result.failureCount === 0) {
        toast({
          variant: "success",
          title: "Categoria aplicada",
          description: `${result.successCount} transação(ões) atualizada(s) para ${categoryLabel}.`
        });
      } else {
        toast({
          variant: "error",
          title: "Atualização parcial",
          description: `${result.successCount} atualizada(s) e ${result.failureCount} com falha.`
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao categorizar transações selecionadas.";
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
          description: "Nenhuma transação selecionada no conjunto atual."
        });
        return;
      }

      const csvRows = [
        [
          "Descrição",
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
        title: "Exportação concluída",
        description: `${rows.length} transação(ões) exportada(s).`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao exportar transações selecionadas.";
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

      await refreshFinanceData();

      if (result.failureCount === 0) {
        toast({
          variant: "success",
          title: "Sugestões aplicadas",
          description: `${result.successCount} transação(ões) categorizada(s) automaticamente.`
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
    await refreshFinanceData();
  };

  const clearAllFilters = useCallback(() => {
    setFilters(initialFilters);
    setSortState({ field: "date", direction: "desc" });
    setPage(1);
    setSearchQuery("");
    setDebouncedQuery("");
    setPendingCategoryQuery("");
    setUncategorizedOnly(false);
  }, []);

  const organizeUncategorized = useCallback(() => {
    setUncategorizedOnly(true);
    setFilters((previous) => ({ ...previous, categoryId: "" }));
    setPage(1);
  }, []);

  const actions = (
    <>
      <Button
        variant="outline"
        onClick={() => setCreatePanelOpen(!showCreate)}
        className="flex-1 border-slate-300/90 bg-white/90 text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:flex-none"
      >
        <Plus className="h-4 w-4" />
        {showCreate ? "Fechar" : "Nova"}
      </Button>
      <Button
        ref={importButtonRef}
        onClick={() => setImportModalOpen(true)}
        className="flex-1 border border-sky-500/40 bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-[0_10px_22px_rgba(14,116,144,0.35)] transition hover:brightness-110 sm:flex-none"
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
    <PageShell title="Transações" subtitle="Lançamentos, filtros e categorização manual" actions={actions}>
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
      <div className="space-y-5">
        <TransactionsKpiCards
          income={summary.income}
          expense={summary.expense}
          balance={summary.balance}
          periodLabel={periodLabel}
        />

        {uncategorizedStats.count > 0 && !uncategorizedOnly ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/90 via-amber-50/60 to-white px-4 py-3 shadow-sm dark:border-amber-900/60 dark:from-amber-950/30 dark:via-slate-950 dark:to-slate-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  <span className="font-semibold">Transações sem categoria:</span> você tem{" "}
                  <span className="font-semibold">{uncategorizedStats.count}</span> lançamento(s) sem categoria no
                  período atual.
                </p>
                <p className="text-xs text-amber-700/90 dark:text-amber-300/90">
                  Isso representa {uncategorizedStats.percentage}% das transações carregadas.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/50"
              onClick={organizeUncategorized}
            >
              Organizar agora
            </Button>
          </section>
        ) : null}

        {showCreate ? (
          <TransactionForm
            values={newTx}
            accounts={manualTransactionAccounts}
            categories={categories}
            busy={creating}
            error={createError}
            onChange={(next) => setNewTx((previous) => ({ ...previous, ...next }))}
            onSubmit={() => handleCreate()}
            onCancel={() => setCreatePanelOpen(false)}
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
              title: "Edição em breve",
              description: "A edição completa da transação será disponibilizada nas próximas iterações."
            });
          }}
          onClearFilters={clearAllFilters}
          onCreateTransaction={() => setCreatePanelOpen(true)}
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

        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white via-white to-slate-100/70 px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Exibindo <span className="font-semibold text-slate-900 dark:text-slate-100">{visibleTransactions.length}</span> de{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{pagination.totalCount}</span> transação(ões)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Página {pagination.page} de {pagination.totalPages}
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
              Próxima
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
