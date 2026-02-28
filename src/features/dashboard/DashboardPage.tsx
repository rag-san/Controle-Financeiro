"use client";

import { format, parseISO } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { cn } from "@/lib/utils";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { Input } from "@/src/components/ui/Input";
import { NetWorthCard } from "@/src/features/dashboard/cards/NetWorthCard";
import { PartialResultCard } from "@/src/features/dashboard/cards/PartialResultCard";
import { SpendingPaceCard } from "@/src/features/dashboard/cards/SpendingPaceCard";
import { TopCategoriesCard } from "@/src/features/dashboard/cards/TopCategoriesCard";
import { NotificationsBell } from "@/src/features/insights/components/NotificationsBell";
import {
  isValidSharedDateInput,
  parseSharedFilters,
  resolveDefaultRange
} from "@/src/features/filters/sharedFilters";

type ApiEnvelope<T> = {
  data: T;
};

type DashboardSummaryPayload = {
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  excludedTotal: number;
  previousPeriodComparison: {
    delta: number;
    percent: number;
    previousNet: number;
    previousIncome: number;
    previousExpense: number;
    previousExcludedTotal: number;
  };
};

type DashboardCategoriesPayload = {
  from: string;
  to: string;
  topCategories: Array<{
    categoryId: string | null;
    name: string;
    color: string;
    total: number;
    percent: number;
    previousTotal: number;
    variationPercent: number;
  }>;
};

type DashboardTrendPoint = {
  bucket: string;
  income: number;
  expense: number;
  net: number;
};

type DashboardTrendsPayload = {
  from: string;
  to: string;
  granularity: "day" | "week" | "month";
  series: DashboardTrendPoint[];
  previousSeries: DashboardTrendPoint[];
};

type DashboardPatrimonyPayload = {
  from: string;
  to: string;
  granularity: "day" | "week" | "month";
  series: Array<{
    bucket: string;
    value: number;
  }>;
};

type DashboardOverviewPayload = {
  from: string;
  to: string;
  summary: DashboardSummaryPayload;
  categories: DashboardCategoriesPayload["topCategories"];
  trends: DashboardTrendsPayload;
  patrimony: DashboardPatrimonyPayload;
};

type DashboardPacePoint = {
  day: number;
  current: number;
  previous: number;
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function safeVariationPercent(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

function formatRangeLabel(from: string, to: string): string {
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return `${from} - ${to}`;
  }
  return `${format(fromDate, "dd/MM/yyyy")} - ${format(toDate, "dd/MM/yyyy")}`;
}

function buildSpendingPaceSeries(current: DashboardTrendPoint[], previous: DashboardTrendPoint[]): DashboardPacePoint[] {
  const length = Math.max(current.length, previous.length);
  const chartData: DashboardPacePoint[] = [];
  let currentAccumulated = 0;
  let previousAccumulated = 0;

  for (let index = 0; index < length; index += 1) {
    currentAccumulated += current[index]?.expense ?? 0;
    previousAccumulated += previous[index]?.expense ?? 0;
    chartData.push({
      day: index + 1,
      current: Number(currentAccumulated.toFixed(2)),
      previous: Number(previousAccumulated.toFixed(2))
    });
  }

  return chartData;
}

export function DashboardLoading(): React.JSX.Element {
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

async function fetchDashboardResource<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const { data: payload, errorMessage } = await parseApiResponse<ApiEnvelope<T> | { error?: unknown }>(response);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (!response.ok || !payload || !("data" in payload)) {
    throw new Error(extractApiError(payload, "Nao foi possivel carregar os dados do dashboard."));
  }

  return payload.data;
}

export function DashboardPage(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtersPopoverId = `dashboard-filters-${useId().replace(/:/g, "")}`;
  const filtersRootRef = useRef<HTMLDivElement | null>(null);
  const filtersFromInputRef = useRef<HTMLInputElement | null>(null);
  const now = useMemo(() => new Date(), []);
  const defaultRange = useMemo(() => resolveDefaultRange(now), [now]);
  const defaultFrom = defaultRange.from;
  const defaultTo = defaultRange.to;
  const [showFilters, setShowFilters] = useState(false);
  const [draftFrom, setDraftFrom] = useState(defaultFrom);
  const [draftTo, setDraftTo] = useState(defaultTo);

  const sharedFilters = useMemo(() => parseSharedFilters(searchParams, now), [now, searchParams]);
  const selectedFrom = sharedFilters.from || defaultFrom;
  const selectedTo = sharedFilters.to || defaultTo;

  useEffect(() => {
    const hasValidFrom = isValidSharedDateInput(searchParams.get("from"));
    const hasValidTo = isValidSharedDateInput(searchParams.get("to"));
    if (hasValidFrom && hasValidTo) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("from", hasValidFrom ? (searchParams.get("from") as string) : defaultFrom);
    nextParams.set("to", hasValidTo ? (searchParams.get("to") as string) : defaultTo);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [defaultFrom, defaultTo, pathname, router, searchParams]);

  const rangeQuery = useMemo(() => {
    const params = new URLSearchParams({
      from: selectedFrom,
      to: selectedTo
    });
    if (sharedFilters.type) params.set("type", sharedFilters.type);
    if (sharedFilters.accountId) params.set("accountId", sharedFilters.accountId);
    if (sharedFilters.categoryId) params.set("categoryId", sharedFilters.categoryId);
    if (sharedFilters.excluded === "excluded") params.set("excluded", "true");
    if (sharedFilters.q) params.set("q", sharedFilters.q);
    return params.toString();
  }, [selectedFrom, selectedTo, sharedFilters]);

  const overviewRequest = useSWR<DashboardOverviewPayload>(
    `/api/dashboard/overview?${rangeQuery}`,
    fetchDashboardResource,
    { revalidateOnFocus: false }
  );

  const loading = overviewRequest.isLoading;
  const error = overviewRequest.error?.message || "";

  useEffect(() => {
    if (!showFilters) return;
    setDraftFrom(selectedFrom);
    setDraftTo(selectedTo);

    const focusTimer = window.setTimeout(() => {
      filtersFromInputRef.current?.focus();
    }, 0);

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!filtersRootRef.current?.contains(target)) {
        setShowFilters(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setShowFilters(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedFrom, selectedTo, showFilters]);

  const updateRangeInUrl = useCallback(
    (from: string, to: string) => {
      if (!isValidSharedDateInput(from) || !isValidSharedDateInput(to)) return;
      if (new Date(`${from}T00:00:00.000Z`).getTime() > new Date(`${to}T00:00:00.000Z`).getTime()) return;

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("from", from);
      nextParams.set("to", to);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const applyDateFilter = useCallback(() => {
    updateRangeInUrl(draftFrom, draftTo);
    setShowFilters(false);
  }, [draftFrom, draftTo, updateRangeInUrl]);

  const clearDateFilter = useCallback(() => {
    updateRangeInUrl(defaultFrom, defaultTo);
    setShowFilters(false);
  }, [defaultFrom, defaultTo, updateRangeInUrl]);

  const isMonthFilterActive = selectedFrom !== defaultFrom || selectedTo !== defaultTo;
  const appliedMonthLabel = formatRangeLabel(selectedFrom, selectedTo);
  const filterButtonLabel = isMonthFilterActive ? `Filtro: ${appliedMonthLabel}` : "Filtros";

  const dashboardView = useMemo(() => {
    if (!overviewRequest.data) {
      return null;
    }

    const summary = overviewRequest.data.summary;
    const categories = overviewRequest.data.categories;
    const trends = overviewRequest.data.trends;
    const patrimonySeries = overviewRequest.data.patrimony.series.map((point) => ({
      date: point.bucket,
      value: point.value
    }));

    const paceDelta = Number(
      (summary.previousPeriodComparison.previousExpense - summary.totalExpense).toFixed(2)
    );
    const expenseVariation = safeVariationPercent(
      summary.totalExpense,
      summary.previousPeriodComparison.previousExpense
    );
    const spendingTrend = buildSpendingPaceSeries(trends.series, trends.previousSeries);
    const patrimonyCurrent = patrimonySeries[patrimonySeries.length - 1]?.value ?? 0;
    const patrimonyVariation =
      patrimonySeries.length >= 2 ? patrimonyCurrent - (patrimonySeries[0]?.value ?? 0) : 0;
    const resultProgress = clamp((summary.totalExpense / Math.max(summary.totalIncome, 1)) * 100);
    const periodDescription = isMonthFilterActive
      ? `${formatRangeLabel(selectedFrom, selectedTo)}`
      : "mes atual";

    return {
      periodDescription,
      spending: {
        paceDelta,
        expenseVariation,
        previousExpense: summary.previousPeriodComparison.previousExpense,
        chartData: spendingTrend
      },
      result: {
        current: summary.net,
        variation: summary.previousPeriodComparison.percent,
        previous: summary.previousPeriodComparison.previousNet,
        progress: resultProgress,
        income: summary.totalIncome,
        expense: summary.totalExpense,
        excluded: summary.excludedTotal
      },
      patrimony: {
        current: patrimonyCurrent,
        variation: Number(patrimonyVariation.toFixed(2)),
        hasData: patrimonySeries.length >= 2,
        series: patrimonySeries
      },
      categories: categories.map((item) => ({
        categoryId: item.categoryId ?? "uncategorized",
        name: item.name,
        color: item.color,
        icon: null,
        current: item.total,
        previous: item.previousTotal,
        variation: item.variationPercent
      }))
    };
  }, [isMonthFilterActive, overviewRequest.data, selectedFrom, selectedTo]);

  const actions = useMemo(
    () => (
      <>
        <div className="relative order-first" ref={filtersRootRef}>
          <Button
            type="button"
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={showFilters}
            aria-controls={showFilters ? filtersPopoverId : undefined}
            onClick={() => setShowFilters((previous) => !previous)}
            className={cn(
              "border border-slate-300/90 bg-white/90 text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
              showFilters &&
                "border-sky-500/40 bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-[0_10px_22px_rgba(14,116,144,0.35)] hover:brightness-110 dark:border-sky-500/30 dark:text-white"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {filterButtonLabel}
          </Button>

          <section
            id={filtersPopoverId}
            role="dialog"
            aria-label="Filtro do dashboard"
            aria-hidden={!showFilters}
            className={[
              "absolute right-0 top-full z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-100/90 p-2.5 shadow-xl dark:border-slate-700 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/90",
              "origin-top-right transition-all duration-150 ease-out",
              showFilters
                ? "visible translate-y-0 scale-100 opacity-100 pointer-events-auto"
                : "invisible -translate-y-1 scale-95 opacity-0 pointer-events-none"
            ].join(" ")}
          >
            <div className="space-y-0.5">
              <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Filtro do dashboard</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Selecione o intervalo de datas.</p>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <label htmlFor="dashboard-filter-from" className="text-[11px] text-slate-500 dark:text-slate-400">
                  De
                </label>
                <Input
                  id="dashboard-filter-from"
                  ref={filtersFromInputRef}
                  type="date"
                  value={draftFrom}
                  onChange={(event) => setDraftFrom(event.target.value)}
                  className="h-9 rounded-xl border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="dashboard-filter-to" className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ate
                </label>
                <Input
                  id="dashboard-filter-to"
                  type="date"
                  value={draftTo}
                  onChange={(event) => setDraftTo(event.target.value)}
                  className="h-9 rounded-xl border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearDateFilter}
                className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              >
                Mes atual
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyDateFilter}
                className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Aplicar
              </Button>
            </div>
          </section>
        </div>

        <NotificationsBell
          insights={[]}
          isLoading={false}
          dismissedCount={0}
          onDismissInsight={() => undefined}
          onSnoozeInsight={() => undefined}
          onClearDismissed={() => undefined}
        />
      </>
    ),
    [applyDateFilter, clearDateFilter, draftFrom, draftTo, filterButtonLabel, filtersPopoverId, showFilters]
  );

  return (
    <PageShell title="Dashboard" subtitle="Visao geral das suas financas" actions={actions}>
      <div className="space-y-5 overflow-x-hidden">
        {loading ? (
          <DashboardLoading />
        ) : error || !dashboardView ? (
          <FeedbackMessage variant="error">{error || "Nao foi possivel carregar os dados do dashboard."}</FeedbackMessage>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-4 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">
                <SpendingPaceCard
                  paceDelta={dashboardView.spending.paceDelta}
                  variationPercent={dashboardView.spending.expenseVariation}
                  previousExpense={dashboardView.spending.previousExpense}
                  chartData={dashboardView.spending.chartData}
                  currentLabel="Periodo atual"
                  previousLabel="Periodo anterior"
                  periodDescription={dashboardView.periodDescription}
                />
              </div>

              <div className="min-w-0 xl:col-span-5">
                <NetWorthCard
                  valorTotal={dashboardView.patrimony.current}
                  variacao={dashboardView.patrimony.variation}
                  isDataAvailable={dashboardView.patrimony.hasData}
                  periodDescription={dashboardView.periodDescription}
                  series={dashboardView.patrimony.series}
                />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-5">
                <PartialResultCard
                  resultadoAtual={dashboardView.result.current}
                  porcentagemVariacao={dashboardView.result.variation}
                  resultadoMesAnterior={dashboardView.result.previous}
                  porcentagemProgresso={dashboardView.result.progress}
                  receita={dashboardView.result.income}
                  gasto={dashboardView.result.expense}
                  excluido={dashboardView.result.excluded}
                  periodDescription={dashboardView.periodDescription}
                />
              </div>

              <div className="min-w-0 xl:col-span-7">
                <TopCategoriesCard
                  categorias={dashboardView.categories}
                  periodDescription={dashboardView.periodDescription}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}
