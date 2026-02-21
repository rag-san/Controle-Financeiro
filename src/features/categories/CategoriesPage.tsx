"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { useToast } from "@/src/components/ui/ToastProvider";
import { CategoriesMonthSummaryCard } from "@/src/features/categories/cards/CategoriesMonthSummaryCard";
import { AutomationsPlaceholder } from "@/src/features/categories/components/AutomationsPlaceholder";
import type { CategoriesTopTab } from "@/src/features/categories/components/CategoriesTopTabs";
import { CategoriesTopTabs } from "@/src/features/categories/components/CategoriesTopTabs";
import { CategoriesTreeList } from "@/src/features/categories/components/CategoriesTreeList";
import { NewCategoryButton } from "@/src/features/categories/components/NewCategoryButton";
import {
  NewCategoryModal,
  type NewCategoryPayload
} from "@/src/features/categories/components/NewCategoryModal";
import {
  buildCategoryMonthAggregates,
  buildTransactionsMonthQuery,
  resolveMonthInterval,
  shiftMonth
} from "@/src/features/categories/utils/categoryAggregates";

type CategoriesBootstrapResponse = {
  categories: CategoryDTO[];
  rules: Array<{ id: string; name: string; enabled: boolean }>;
};

type TransactionsResponse = {
  items: TransactionDTO[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

async function fetchMonthTransactions(monthDate: Date, signal?: AbortSignal): Promise<TransactionDTO[]> {
  const interval = resolveMonthInterval(monthDate);
  const baseQuery = buildTransactionsMonthQuery(interval);
  const items: TransactionDTO[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetch(`/api/transactions?${baseQuery}&page=${page}&pageSize=200`, { signal });
    const data = (await response.json()) as TransactionsResponse | { error?: string };
    if (!response.ok || !("items" in data)) {
      throw new Error("error" in data && data.error ? data.error : "Falha ao carregar transações por categoria.");
    }

    items.push(...data.items);
    hasNextPage = data.pagination.hasNextPage;
    page += 1;
  }

  return items;
}

export function CategoriesPage(): React.JSX.Element {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CategoriesTopTab>("categories");
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);

  const loadBootstrap = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/categories/bootstrap");
      const data = (await response.json()) as CategoriesBootstrapResponse | { error?: string };

      if (!response.ok || !("categories" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Falha ao carregar categorias.");
      }

      setCategories(data.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar categorias.");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async (monthDate: Date): Promise<void> => {
    setLoadingTransactions(true);
    setError("");
    try {
      const items = await fetchMonthTransactions(monthDate);
      setTransactions(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar gastos do mês.");
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    void loadTransactions(selectedMonth);
  }, [loadTransactions, selectedMonth]);

  const monthAggregates = useMemo(
    () => buildCategoryMonthAggregates(categories, transactions, selectedMonth),
    [categories, transactions, selectedMonth]
  );

  const monthQuery = useMemo(
    () => buildTransactionsMonthQuery(monthAggregates.monthInterval),
    [monthAggregates.monthInterval]
  );

  const handleCreateCategory = useCallback(
    async (payload: NewCategoryPayload): Promise<void> => {
      setBusy(true);
      try {
        const response = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "Falha ao criar categoria.");
        }

        await loadBootstrap();
        setNewCategoryOpen(false);
        toast({
          variant: "success",
          title: "Categoria criada",
          description: `${payload.name} foi adicionada com sucesso.`
        });
      } catch (createError) {
        toast({
          variant: "error",
          title: "Erro ao criar categoria",
          description: createError instanceof Error ? createError.message : "Falha ao criar categoria."
        });
      } finally {
        setBusy(false);
      }
    },
    [loadBootstrap, toast]
  );

  const actions = <NewCategoryButton onClick={() => setNewCategoryOpen(true)} />;

  return (
    <PageShell title="Categorias" subtitle="Distribuição de gastos e estrutura de categorias" actions={actions}>
      <div className="space-y-5">
        <div className="flex justify-center">
          <CategoriesTopTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : null}

        {activeTab === "categories" ? (
          <section id="categories-panel-categories" role="tabpanel" className="space-y-4">
            {loading || loadingTransactions ? (
              <div className="space-y-4">
                <Skeleton className="h-64 rounded-2xl" />
                <Skeleton className="h-[520px] rounded-2xl" />
              </div>
            ) : (
              <>
                <CategoriesMonthSummaryCard
                  totalSpent={monthAggregates.totalSpent}
                  monthDate={selectedMonth}
                  slices={monthAggregates.donut}
                  onPreviousMonth={() => setSelectedMonth((current) => shiftMonth(current, -1))}
                  onNextMonth={() => setSelectedMonth((current) => shiftMonth(current, 1))}
                />

                <CategoriesTreeList
                  groups={monthAggregates.groups}
                  totalSpent={monthAggregates.totalSpent}
                  monthQuery={monthQuery}
                />
              </>
            )}
          </section>
        ) : (
          <section id="categories-panel-automations" role="tabpanel">
            <AutomationsPlaceholder />
          </section>
        )}
      </div>

      <NewCategoryModal
        open={newCategoryOpen}
        categories={categories}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setNewCategoryOpen(false);
        }}
        onSubmit={handleCreateCategory}
      />
    </PageShell>
  );
}
