"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { CategoryDTO } from "@/lib/types";
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
  type CategoryMonthAggregates,
  buildTransactionsMonthQuery,
  resolveMonthInterval,
  shiftMonth,
  type MonthInterval
} from "@/src/features/categories/utils/categoryAggregates";

type CategoriesBootstrapResponse = {
  categories: CategoryDTO[];
  rules: Array<{ id: string; name: string; enabled: boolean }>;
};

type CategoriesMetricsResponse = {
  view: "categories";
  month: string;
  aggregates: Omit<CategoryMonthAggregates, "monthInterval"> & {
    monthInterval: {
      start: string;
      end: string;
    };
  };
};

function parseInterval(interval: { start: string; end: string }): MonthInterval {
  return {
    start: new Date(interval.start),
    end: new Date(interval.end)
  };
}

export function CategoriesPage(): React.JSX.Element {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CategoriesTopTab>("categories");
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [monthAggregates, setMonthAggregates] = useState<CategoryMonthAggregates>({
    totalSpent: 0,
    list: [],
    donut: [],
    groups: [],
    monthInterval: resolveMonthInterval(new Date())
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
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

  const loadMonthMetrics = useCallback(async (monthDate: Date): Promise<void> => {
    setLoadingMetrics(true);
    setError("");
    try {
      const query = new URLSearchParams({
        view: "categories",
        month: format(monthDate, "yyyy-MM")
      });
      const response = await fetch(`/api/metrics/official?${query.toString()}`);
      const { data, errorMessage } = await parseApiResponse<CategoriesMetricsResponse | { error?: unknown }>(
        response
      );
      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data || !("view" in data) || data.view !== "categories") {
        throw new Error(extractApiError(data, "Falha ao carregar gastos do mês."));
      }

      setMonthAggregates({
        ...data.aggregates,
        monthInterval: parseInterval(data.aggregates.monthInterval)
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar gastos do mês.");
      setMonthAggregates({
        totalSpent: 0,
        list: [],
        donut: [],
        groups: [],
        monthInterval: resolveMonthInterval(monthDate)
      });
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    void loadMonthMetrics(selectedMonth);
  }, [loadMonthMetrics, selectedMonth]);

  const monthQuery = useMemo(
    () => buildTransactionsMonthQuery(resolveMonthInterval(selectedMonth)),
    [selectedMonth]
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
            {loading || loadingMetrics ? (
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
