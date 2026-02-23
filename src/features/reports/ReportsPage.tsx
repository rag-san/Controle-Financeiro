"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { IconButton } from "@/src/components/ui/IconButton";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { IncomeVsExpensesChartCard } from "@/src/features/reports/components/IncomeVsExpensesChartCard";
import { KpiGrid } from "@/src/features/reports/components/KpiGrid";
import { RecurringDetectedCard } from "@/src/features/reports/components/RecurringDetectedCard";
import { ReportsFilters } from "@/src/features/reports/components/ReportsFilters";
import { SpendingByCategoryCard } from "@/src/features/reports/components/SpendingByCategoryCard";
import { TopMerchantsCard } from "@/src/features/reports/components/TopMerchantsCard";
import { SankeyCard } from "@/src/features/reports/sankey/SankeyCard";
import type { ReportsModel, ReportsPeriodComparison, ReportsPeriodPreset } from "@/src/features/reports/types";

function ReportsLoading(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[130px] rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
      <Skeleton className="h-[150px] rounded-2xl" />
    </div>
  );
}

type SerializedPeriodRange = {
  preset: ReportsPeriodPreset;
  label: string;
  start: string;
  end: string;
};

type ReportsMetricsResponse = {
  view: "reports";
  period: {
    current: SerializedPeriodRange;
    previous: SerializedPeriodRange;
  };
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  model: Omit<ReportsModel, "timeSeries" | "recurringDetected"> & {
    timeSeries: Array<
      Omit<ReportsModel["timeSeries"][number], "from" | "to"> & {
        from: string;
        to: string;
      }
    >;
    recurringDetected: Array<
      Omit<ReportsModel["recurringDetected"][number], "nextExpectedDate"> & {
        nextExpectedDate: string | null;
      }
    >;
  };
};

function parseDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function deserializePeriod(period: ReportsMetricsResponse["period"]): ReportsPeriodComparison {
  return {
    current: {
      ...period.current,
      start: parseDate(period.current.start),
      end: parseDate(period.current.end)
    },
    previous: {
      ...period.previous,
      start: parseDate(period.previous.start),
      end: parseDate(period.previous.end)
    }
  };
}

function deserializeModel(model: ReportsMetricsResponse["model"]): ReportsModel {
  return {
    ...model,
    timeSeries: model.timeSeries.map((item) => ({
      ...item,
      from: parseDate(item.from),
      to: parseDate(item.to)
    })),
    recurringDetected: model.recurringDetected.map((item) => ({
      ...item,
      nextExpectedDate: item.nextExpectedDate ? parseDate(item.nextExpectedDate) : null
    }))
  };
}

export function ReportsPage(): React.JSX.Element {
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [preset, setPreset] = useState<ReportsPeriodPreset>("3M");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [periodComparison, setPeriodComparison] = useState<ReportsPeriodComparison | null>(null);
  const [model, setModel] = useState<ReportsModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setError("");

      const query = new URLSearchParams({
        view: "reports",
        preset
      });
      if (accountId) query.set("accountId", accountId);
      if (categoryId) query.set("categoryId", categoryId);

      try {
        const response = await fetch(`/api/metrics/official?${query.toString()}`, { signal });
        const { data, errorMessage } = await parseApiResponse<ReportsMetricsResponse | { error?: unknown }>(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !data || !("view" in data) || data.view !== "reports") {
          throw new Error(extractApiError(data, "Falha ao carregar métricas oficiais de relatórios."));
        }

        setAccounts(data.accounts);
        setCategories(data.categories);
        setPeriodComparison(deserializePeriod(data.period));
        setModel(deserializeModel(data.model));
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setAccounts([]);
        setCategories([]);
        setPeriodComparison(null);
        setModel(null);
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar relatórios.");
      } finally {
        setLoading(false);
      }
    },
    [accountId, categoryId, preset]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const actions = useMemo(
    () => (
      <IconButton
        aria-label="Atualizar relatórios"
        icon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
        onClick={() => void load()}
        disabled={loading}
      />
    ),
    [load, loading]
  );

  return (
    <PageShell
      title="Relatórios"
      subtitle="Visão consolidada por período com métricas e tendências financeiras"
      actions={actions}
    >
      {loading ? (
        <ReportsLoading />
      ) : error ? (
        <FeedbackMessage variant="error">{error}</FeedbackMessage>
      ) : !model || !periodComparison ? (
        <FeedbackMessage variant="error">Falha ao montar o modelo oficial de relatórios.</FeedbackMessage>
      ) : (
        <div className="space-y-4">
          <ReportsFilters
            preset={preset}
            onPresetChange={setPreset}
            accounts={accounts}
            categories={categories}
            accountId={accountId}
            categoryId={categoryId}
            onAccountIdChange={setAccountId}
            onCategoryIdChange={setCategoryId}
            disabled={loading}
          />

          {!model.hasCurrentData ? (
            <EmptyState
              title="Sem dados para o período selecionado"
              description="Ajuste os filtros ou importe novas transações para gerar relatórios."
              ctaLabel="Import transactions"
              ctaHref="/transactions"
            />
          ) : (
            <>
              <KpiGrid current={model.currentTotals} previous={model.previousTotals} />

              <div className="grid gap-4 xl:grid-cols-2">
                <SpendingByCategoryCard items={model.categorySpending} />
                <IncomeVsExpensesChartCard data={model.timeSeries} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <TopMerchantsCard merchants={model.topMerchants} period={periodComparison.current} />
                <RecurringDetectedCard items={model.recurringDetected} />
              </div>
            </>
          )}

          <SankeyCard model={model.sankey} />
        </div>
      )}
    </PageShell>
  );
}
