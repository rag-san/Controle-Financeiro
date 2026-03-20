"use client";

import { format, parseISO } from "date-fns";
import Link from "next/link";
import { LayoutDashboard, SlidersHorizontal, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { cn } from "@/lib/utils";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { GuidanceCard } from "@/src/components/ui/GuidanceCard";
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
  cashInflow?: number;
  cashOutflow?: number;
  cashNet?: number;
  excludedTotal: number;
  previousPeriodComparison: {
    delta: number;
    percent: number;
    previousNet: number;
    previousIncome: number;
    previousExpense: number;
    previousCashInflow?: number;
    previousCashOutflow?: number;
    previousCashNet?: number;
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

export function isDashboardOverviewEmpty(overview: DashboardOverviewPayload): boolean {
  const hasSummaryActivity =
    Math.abs(overview.summary.totalIncome) > 0 ||
    Math.abs(overview.summary.totalExpense) > 0 ||
    Math.abs(overview.summary.cashInflow ?? 0) > 0 ||
    Math.abs(overview.summary.cashOutflow ?? 0) > 0 ||
    Math.abs(overview.summary.excludedTotal) > 0 ||
    Math.abs(overview.summary.previousPeriodComparison.previousIncome) > 0 ||
    Math.abs(overview.summary.previousPeriodComparison.previousExpense) > 0;

  const hasCategories = overview.categories.some(
    (item) => Math.abs(item.total) > 0 || Math.abs(item.previousTotal) > 0
  );
  const hasTrendData =
    overview.trends.series.some(
      (point) => Math.abs(point.income) > 0 || Math.abs(point.expense) > 0 || Math.abs(point.net) > 0
    ) ||
    overview.trends.previousSeries.some(
      (point) => Math.abs(point.income) > 0 || Math.abs(point.expense) > 0 || Math.abs(point.net) > 0
    );
  const hasPatrimony = overview.patrimony.series.some((point) => Math.abs(point.value) > 0);

  return !(hasSummaryActivity || hasCategories || hasTrendData || hasPatrimony);
}

export function DashboardEmptyState(): React.JSX.Element {
  return (
    <section
      className="app-surface-card rounded-2xl border border-dashed border-border/80 px-5 py-8 text-center sm:px-8 sm:py-10"
      data-testid="dashboard-empty-state"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LayoutDashboard className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Você ainda não possui dados financeiros.</h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Importe seu extrato bancário para começar. Depois disso, o Finance Control preenche o dashboard,
            organiza categorias e facilita sua leitura mensal.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Se você ainda não usa conta bancária, também pode começar adicionando gastos manualmente em Transações.
          </p>
        </div>
        <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            id="tour-dashboard-empty-import"
            href="/transactions?import=1"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Importar extrato
          </Link>
          <Link
            href="/transactions?new=1"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Adicionar manualmente
          </Link>
        </div>
      </div>
    </section>
  );
}

export function DashboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-6" data-testid="dashboard-loading">
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
  const isOverviewEmpty = useMemo(
    () => (overviewRequest.data ? isDashboardOverviewEmpty(overviewRequest.data) : false),
    [overviewRequest.data]
  );

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
    const resultIncome = summary.cashInflow ?? summary.totalIncome;
    const resultExpense = summary.cashOutflow ?? summary.totalExpense;
    const resultCurrent = summary.cashNet ?? summary.net;
    const resultPrevious =
      summary.previousPeriodComparison.previousCashNet ?? summary.previousPeriodComparison.previousNet;
    const resultVariation = safeVariationPercent(resultCurrent, resultPrevious);
    const resultProgress = clamp((resultExpense / Math.max(resultIncome, 1)) * 100);
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
        current: resultCurrent,
        variation: resultVariation,
        previous: resultPrevious,
        progress: resultProgress,
        income: resultIncome,
        expense: resultExpense,
        excluded: summary.excludedTotal
      },
      patrimony: {
        current: patrimonyCurrent,
        variation: Number(patrimonyVariation.toFixed(2)),
        hasData: patrimonySeries.length >= 2,
        series: patrimonySeries
      },
      categories: categories.slice(0, 5).map((item) => ({
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
        <Button
          id="tour-dashboard-import"
          type="button"
          size="sm"
          onClick={() => router.push("/transactions?import=1")}
          className="w-full justify-center border border-primary/35 bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 sm:w-auto sm:justify-start"
          aria-label="Importar extrato para preencher o dashboard"
        >
          <Upload className="h-4 w-4" />
          <span>Importar extrato</span>
        </Button>

        <div className="relative order-first w-full sm:w-auto" ref={filtersRootRef}>
          <Button
            id="tour-dashboard-filters"
            type="button"
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={showFilters}
            aria-controls={showFilters ? filtersPopoverId : undefined}
            aria-label={filterButtonLabel}
            onClick={() => setShowFilters((previous) => !previous)}
            className={cn(
              "w-full justify-center border border-border/70 bg-card/85 text-muted-foreground shadow-sm transition hover:bg-secondary hover:text-foreground sm:w-auto sm:justify-start",
              showFilters &&
                "border-primary/40 bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(14,116,144,0.32)] hover:brightness-105"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="sm:hidden">Filtros</span>
            <span className="hidden sm:inline">{filterButtonLabel}</span>
          </Button>

          <section
            id={filtersPopoverId}
            role="dialog"
            aria-label="Filtro do dashboard"
            aria-hidden={!showFilters}
            className={[
              "absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border border-border/80 bg-card/95 p-2.5 shadow-xl backdrop-blur sm:left-auto sm:right-0 sm:w-[19rem] sm:max-w-[calc(100vw-2rem)]",
              "origin-top transition-all duration-150 ease-out sm:origin-top-right",
              showFilters
                ? "visible translate-y-0 scale-100 opacity-100 pointer-events-auto"
                : "invisible -translate-y-1 scale-95 opacity-0 pointer-events-none"
            ].join(" ")}
          >
            <div className="space-y-0.5">
              <h3 className="text-[13px] font-semibold text-foreground">Filtro do dashboard</h3>
              <p className="text-[11px] text-muted-foreground">Selecione o intervalo de datas.</p>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <label htmlFor="dashboard-filter-from" className="text-[11px] text-muted-foreground">
                  De
                </label>
                <Input
                  id="dashboard-filter-from"
                  ref={filtersFromInputRef}
                  type="date"
                  value={draftFrom}
                  onChange={(event) => setDraftFrom(event.target.value)}
                  className="h-9 rounded-xl border-border bg-background/70"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="dashboard-filter-to" className="text-[11px] text-muted-foreground">
                  Ate
                </label>
                <Input
                  id="dashboard-filter-to"
                  type="date"
                  value={draftTo}
                  onChange={(event) => setDraftTo(event.target.value)}
                  className="h-9 rounded-xl border-border bg-background/70"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearDateFilter}
                className="text-muted-foreground hover:text-foreground"
              >
                Mes atual
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyDateFilter}
                className="border-border bg-card/80 text-foreground hover:bg-secondary"
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
    [applyDateFilter, clearDateFilter, draftFrom, draftTo, filterButtonLabel, filtersPopoverId, router, showFilters]
  );

  return (
    <PageShell
      title="Dashboard"
      subtitle="Entenda seu momento financeiro e descubra o próximo passo para manter tudo organizado."
      actions={actions}
    >
      <div className="space-y-5 overflow-x-hidden">
        <section className="grid gap-4 xl:grid-cols-3" aria-label="Guias do dashboard">
          <GuidanceCard
            eyebrow="Dashboard"
            title="Acompanhe o resultado do período"
            description="Aqui você vê receitas, gastos, patrimônio e ritmo financeiro sem precisar navegar por várias telas."
            tooltip="Use este painel para entender rapidamente se o mês está sob controle e quais áreas pedem atenção."
          />
          <GuidanceCard
            eyebrow="Primeiro passo"
            title="Importe seu extrato para preencher os gráficos"
            description="Seu fluxo principal começa na importação. Em poucos passos você traz as transações e libera os indicadores."
            tooltip="A importação aceita CSV, OFX e PDFs compatíveis. Depois do preview, a confirmação final envia os dados."
            ctaLabel="Abrir importação"
            ctaHref="/transactions?import=1"
          />
          <GuidanceCard
            eyebrow="Categorias"
            title="Entenda onde o dinheiro está indo"
            description="Depois da importação, revise categorias para interpretar seus gastos e identificar oportunidades de ajuste."
            tooltip="Categorias agrupam despesas parecidas para facilitar análise e criação de regras automáticas."
            ctaLabel="Ver categorias"
            ctaHref="/categories"
          />
        </section>

        {loading ? (
          <DashboardLoading />
        ) : error || !dashboardView ? (
          <FeedbackMessage variant="error" data-testid="dashboard-error">
            {error || "Nao foi possivel carregar os dados do dashboard."}
          </FeedbackMessage>
        ) : isOverviewEmpty ? (
          <DashboardEmptyState />
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

              <div id="tour-dashboard-top-categories" className="min-w-0 xl:col-span-7">
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
