"use client";

import {
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears
} from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { NetWorthCard, type NetWorthFilter } from "@/src/features/dashboard/cards/NetWorthCard";
import { PartialResultCard } from "@/src/features/dashboard/cards/PartialResultCard";
import { SpendingPaceCard } from "@/src/features/dashboard/cards/SpendingPaceCard";
import { TopCategoriesCard } from "@/src/features/dashboard/cards/TopCategoriesCard";
import { buildInsights } from "@/src/features/insights/buildInsights";
import { NotificationsBell } from "@/src/features/insights/components/NotificationsBell";
import type { Insight } from "@/src/features/insights/types";
import { filterActiveInsights } from "@/src/features/insights/utils/filterActiveInsights";
import {
  loadDismissed,
  loadSnoozed,
  pruneExpiredSnoozed,
  saveDismissed,
  saveSnoozed
} from "@/src/features/insights/utils/notificationsState";
import { buildMonthComparison } from "@/src/features/insights/utils/period";
import { formatMonthLabel } from "@/src/utils/format";

type DashboardPayload = {
  referenceMonth: string;
  isCurrentMonthReference: boolean;
  cards: {
    income: number;
    expense: number;
    result: number;
    netWorth: number;
    spendPaceDelta: number;
    resultDelta: number;
  };
  periodComparison?: {
    current: {
      income: number;
      expense: number;
      result: number;
      excluded: number;
    };
    previous: {
      income: number;
      expense: number;
      result: number;
      excluded: number;
    };
  };
  netWorthDelta?: number;
  netWorthSeries?: Array<{ date: string; value: number }>;
  spendingTrend: { day: number; current: number; previous: number }[];
  topCategories: {
    categoryId: string;
    name: string;
    color: string;
    icon?: string | null;
    current: number;
    previous: number;
    variation: number;
  }[];
};

type TransactionResponse = {
  items: TransactionDTO[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta?: {
    categories: CategoryDTO[];
  };
};

const DISMISSED_STORAGE_KEY = "dismissed_insights";
const SNOOZED_STORAGE_KEY = "snoozed_insights";

function formatDateToInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function resolveReferenceDate(referenceMonth: string): Date {
  const [yearPart, monthPart] = referenceMonth.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return new Date();
  }

  return new Date(year, month - 1, 15);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDashboardPayload(value: unknown): value is DashboardPayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<DashboardPayload>;
  if (!candidate.cards || typeof candidate.cards !== "object") return false;

  const cards = candidate.cards as Partial<DashboardPayload["cards"]>;
  return (
    typeof candidate.referenceMonth === "string" &&
    typeof candidate.isCurrentMonthReference === "boolean" &&
    isFiniteNumber(cards.income) &&
    isFiniteNumber(cards.expense) &&
    isFiniteNumber(cards.result) &&
    isFiniteNumber(cards.netWorth) &&
    isFiniteNumber(cards.spendPaceDelta) &&
    isFiniteNumber(cards.resultDelta) &&
    Array.isArray(candidate.spendingTrend) &&
    Array.isArray(candidate.topCategories)
  );
}

function getFilterStartDate(endDate: Date, filter: NetWorthFilter): Date {
  switch (filter) {
    case "1D":
      return subDays(endDate, 1);
    case "1W":
      return subDays(endDate, 7);
    case "1M":
      return subMonths(endDate, 1);
    case "3M":
      return subMonths(endDate, 3);
    case "YTD":
      return startOfYear(endDate);
    case "1Y":
      return subYears(endDate, 1);
    case "ALL":
    default:
      return subYears(endDate, 100);
  }
}

function filterSeriesByRange(
  series: Array<{ date: string; value: number }>,
  filter: NetWorthFilter
): Array<{ date: string; value: number }> {
  if (series.length === 0 || filter === "ALL") return series;

  const sorted = [...series].sort((a, b) => (a.date > b.date ? 1 : -1));
  const endDate = parseISO(sorted[sorted.length - 1].date);
  const startDate = getFilterStartDate(endDate, filter);

  return sorted.filter((point) => {
    const pointDate = parseISO(point.date);
    return pointDate >= startOfDay(startDate) && pointDate <= endDate;
  });
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function previousValueFromDelta(current: number, deltaPercent: number): number {
  const denominator = 1 + deltaPercent / 100;
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return current / denominator;
}

function DashboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[420px] xl:col-span-7" />
        <Skeleton className="h-[420px] xl:col-span-5" />
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[320px] xl:col-span-5" />
        <Skeleton className="h-[320px] xl:col-span-7" />
      </div>
    </div>
  );
}

async function fetchTransactionsForInsights(params: {
  from: Date;
  to: Date;
  signal?: AbortSignal;
}): Promise<{ items: TransactionDTO[]; categories: CategoryDTO[] }> {
  const aggregatedItems: TransactionDTO[] = [];
  let categories: CategoryDTO[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = new URLSearchParams({
      period: "custom",
      from: formatDateToInput(params.from),
      to: params.to.toISOString(),
      page: String(page),
      pageSize: "200"
    });
    if (page === 1) {
      query.set("includeMeta", "1");
    }

    const response = await fetch(`/api/transactions?${query.toString()}`, { signal: params.signal });
    const { data, errorMessage } = await parseApiResponse<TransactionResponse | { error?: unknown }>(response);

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    if (!response.ok || !data || !("items" in data)) {
      throw new Error(extractApiError(data, "Nao foi possivel carregar dados para insights."));
    }

    aggregatedItems.push(...data.items);
    if (page === 1 && data.meta?.categories) {
      categories = data.meta.categories;
    }

    hasNextPage = data.pagination.hasNextPage;
    page += 1;
  }

  return { items: aggregatedItems, categories };
}

export function DashboardPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [netWorthFilter, setNetWorthFilter] = useState<NetWorthFilter>("1W");
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set<string>());
  const [snoozedInsights, setSnoozedInsights] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/metrics/official?view=dashboard");
        const { data: payload, errorMessage } = await parseApiResponse<DashboardPayload | { error?: unknown }>(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !payload) {
          throw new Error(extractApiError(payload, "Nao foi possivel carregar o dashboard."));
        }

        if (!isDashboardPayload(payload)) {
          throw new Error("Resposta invalida do dashboard.");
        }

        setData(payload);
      } catch (loadError) {
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "Erro ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const dismissed = loadDismissed(DISMISSED_STORAGE_KEY);
    const snoozedRaw = loadSnoozed(SNOOZED_STORAGE_KEY);
    const snoozedPruned = pruneExpiredSnoozed(snoozedRaw);

    setDismissedInsights(dismissed);
    setSnoozedInsights(snoozedPruned);

    if (Object.keys(snoozedRaw).length !== Object.keys(snoozedPruned).length) {
      saveSnoozed(SNOOZED_STORAGE_KEY, snoozedPruned);
    }
  }, []);

  useEffect(() => {
    if (!data) {
      setInsights([]);
      setInsightsLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadInsights = async (): Promise<void> => {
      setInsightsLoading(true);

      try {
        const referenceDate = resolveReferenceDate(data.referenceMonth);
        const period = buildMonthComparison(referenceDate);
        const historyStart = startOfMonth(subMonths(period.currentPeriod.start, 6));
        const historyEnd = period.currentPeriod.end;

        const insightsData = await fetchTransactionsForInsights({
          from: historyStart,
          to: historyEnd,
          signal: controller.signal
        });

        const computed = buildInsights({
          transactions: insightsData.items,
          categories: insightsData.categories,
          period,
          today: new Date()
        });

        setInsights(computed);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setInsights([]);
      } finally {
        setInsightsLoading(false);
      }
    };

    void loadInsights();
    return () => controller.abort();
  }, [data]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSnoozedInsights((current) => {
        const pruned = pruneExpiredSnoozed(current);
        if (Object.keys(pruned).length !== Object.keys(current).length) {
          saveSnoozed(SNOOZED_STORAGE_KEY, pruned);
          return pruned;
        }
        return current;
      });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const dashboardView = useMemo(() => {
    if (!data) return null;

    const usingReferenceFallback = !data.isCurrentMonthReference;
    const referenceMonthLabel = formatMonthLabel(data.referenceMonth);
    const periodDescription = usingReferenceFallback ? `periodo de referencia (${referenceMonthLabel})` : "mes atual";

    const currentPeriod = data.periodComparison?.current ?? {
      income: data.cards.income,
      expense: data.cards.expense,
      result: data.cards.result,
      excluded: 0
    };

    const previousPeriod = data.periodComparison?.previous ?? {
      income: data.cards.income,
      expense: previousValueFromDelta(data.cards.expense, data.cards.spendPaceDelta),
      result: previousValueFromDelta(data.cards.result, data.cards.resultDelta),
      excluded: 0
    };

    const paceDelta = previousPeriod.expense - currentPeriod.expense;
    const resultProgress = clamp((currentPeriod.expense / Math.max(currentPeriod.income, 1)) * 100);

    const sortedSeries = [...(data.netWorthSeries ?? [])].sort((a, b) => (a.date > b.date ? 1 : -1));
    const filteredNetWorthSeries = filterSeriesByRange(sortedSeries, netWorthFilter);
    const netWorthSeries = filteredNetWorthSeries.length > 0 ? filteredNetWorthSeries : sortedSeries;

    const netWorthCurrent = netWorthSeries[netWorthSeries.length - 1]?.value ?? data.cards.netWorth;
    const netWorthVariation =
      netWorthSeries.length >= 2
        ? netWorthCurrent - netWorthSeries[0].value
        : (data.netWorthDelta ?? 0);

    return {
      usingReferenceFallback,
      referenceMonthLabel,
      periodDescription,
      currentPeriod,
      previousPeriod,
      paceDelta,
      resultProgress,
      netWorthCurrent,
      netWorthVariation,
      netWorthSeries,
      topCategories: data.topCategories.map((item) => ({
        ...item,
        icon: item.icon ?? null
      }))
    };
  }, [data, netWorthFilter]);

  const handleDismissInsight = useCallback((insightId: string): void => {
    setDismissedInsights((current) => {
      const next = new Set(current);
      next.add(insightId);
      saveDismissed(DISMISSED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleSnoozeInsight = useCallback((insightId: string, days: 1 | 7): void => {
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    setSnoozedInsights((current) => {
      const next = { ...current, [insightId]: until };
      saveSnoozed(SNOOZED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleClearDismissed = useCallback((): void => {
    const next = new Set<string>();
    setDismissedInsights(next);
    saveDismissed(DISMISSED_STORAGE_KEY, next);
  }, []);

  const activeNotifications = useMemo(() => {
    const prunedSnoozed = pruneExpiredSnoozed(snoozedInsights);
    return filterActiveInsights(insights, dismissedInsights, prunedSnoozed);
  }, [dismissedInsights, insights, snoozedInsights]);

  const actions = useMemo(
    () => (
      <NotificationsBell
        insights={activeNotifications}
        isLoading={insightsLoading}
        dismissedCount={dismissedInsights.size}
        onDismissInsight={handleDismissInsight}
        onSnoozeInsight={handleSnoozeInsight}
        onClearDismissed={handleClearDismissed}
      />
    ),
    [
      activeNotifications,
      dismissedInsights.size,
      handleClearDismissed,
      handleDismissInsight,
      handleSnoozeInsight,
      insightsLoading
    ]
  );

  return (
    <PageShell title="Dashboard" subtitle="Aqui esta uma visao geral das suas financas" actions={actions}>
      {loading ? (
        <DashboardLoading />
      ) : !data || !dashboardView ? (
        <FeedbackMessage variant="error">{error || "Nao foi possivel carregar os dados do dashboard."}</FeedbackMessage>
      ) : (
        <div className="space-y-6">
          {dashboardView.usingReferenceFallback ? (
            <FeedbackMessage variant="warning">
              Sem lancamentos no mes atual. Exibindo periodo de referencia em {dashboardView.referenceMonthLabel}.
            </FeedbackMessage>
          ) : null}

          <section className="grid gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <SpendingPaceCard
                paceDelta={dashboardView.paceDelta}
                variationPercent={data.cards.spendPaceDelta}
                previousExpense={dashboardView.previousPeriod.expense}
                chartData={data.spendingTrend}
                currentLabel={dashboardView.usingReferenceFallback ? "Periodo de referencia" : "Este mes"}
                previousLabel={
                  dashboardView.usingReferenceFallback ? "Mes anterior ao periodo" : "Mes passado"
                }
                periodDescription={dashboardView.periodDescription}
              />
            </div>

            <div className="xl:col-span-5">
              <NetWorthCard
                valorTotal={dashboardView.netWorthCurrent}
                variacao={dashboardView.netWorthVariation}
                isDataAvailable={dashboardView.netWorthSeries.length >= 2}
                activeFilter={netWorthFilter}
                onFilterChange={setNetWorthFilter}
                periodDescription={dashboardView.periodDescription}
                series={dashboardView.netWorthSeries}
              />
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <PartialResultCard
                resultadoAtual={dashboardView.currentPeriod.result}
                porcentagemVariacao={data.cards.resultDelta}
                resultadoMesAnterior={dashboardView.previousPeriod.result}
                porcentagemProgresso={dashboardView.resultProgress}
                receita={dashboardView.currentPeriod.income}
                gasto={dashboardView.currentPeriod.expense}
                excluido={dashboardView.currentPeriod.excluded}
                periodDescription={dashboardView.periodDescription}
              />
            </div>

            <div className="xl:col-span-7">
              <TopCategoriesCard
                categorias={dashboardView.topCategories}
                periodDescription={dashboardView.periodDescription}
              />
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
