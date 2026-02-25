"use client";

import {
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
  subDays,
  subYears
} from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
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
  spendingTrendDaily?: { day: number; current: number; previous: number }[];
  spendingTrendMeta?: {
    compareUntilDay?: number;
  };
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

const MONTH_GRID: Array<{ monthIndex: number; label: string }> = [
  { monthIndex: 0, label: "Jan" },
  { monthIndex: 1, label: "Fev" },
  { monthIndex: 2, label: "Mar" },
  { monthIndex: 3, label: "Abr" },
  { monthIndex: 4, label: "Mai" },
  { monthIndex: 5, label: "Jun" },
  { monthIndex: 6, label: "Jul" },
  { monthIndex: 7, label: "Ago" },
  { monthIndex: 8, label: "Set" },
  { monthIndex: 9, label: "Out" },
  { monthIndex: 10, label: "Nov" },
  { monthIndex: 11, label: "Dez" }
];

function parseMonthKey(value: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      return { year, monthIndex: month - 1 };
    }
  }

  const fallback = new Date();
  return { year: fallback.getFullYear(), monthIndex: fallback.getMonth() };
}

function formatMonthKey(year: number, monthIndex: number): string {
  const normalizedMonth = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${normalizedMonth}`;
}

function buildTransactionsMonthHref(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  const monthDate = new Date(parsed.year, parsed.monthIndex, 1);
  const from = format(startOfMonth(monthDate), "yyyy-MM-dd");
  const to = format(endOfMonth(monthDate), "yyyy-MM-dd");
  return `/transactions?period=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

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

function previousMonthKey(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  const date = new Date(parsed.year, parsed.monthIndex, 1);
  date.setMonth(date.getMonth() - 1);
  return formatMonthKey(date.getFullYear(), date.getMonth());
}

function isZeroAmount(value: number): boolean {
  return Math.abs(value) < 0.005;
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
      throw new Error(extractApiError(data, "Não foi possível carregar dados para insights."));
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
  const now = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => format(now, "yyyy-MM"), [now]);
  const currentMonthParsed = useMemo(() => parseMonthKey(currentMonthKey), [currentMonthKey]);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [netWorthFilter, setNetWorthFilter] = useState<NetWorthFilter>("1W");
  const [showFilters, setShowFilters] = useState(false);
  const [dashboardMonth, setDashboardMonth] = useState("");
  const [pickerYear, setPickerYear] = useState(currentMonthParsed.year);
  const [pickerMonthIndex, setPickerMonthIndex] = useState(currentMonthParsed.monthIndex);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set<string>());
  const [snoozedInsights, setSnoozedInsights] = useState<Record<string, number>>({});
  const filtersPopoverId = `dashboard-filters-${useId().replace(/:/g, "")}`;
  const filtersRootRef = useRef<HTMLDivElement | null>(null);
  const filtersMonthButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams({ view: "dashboard" });
      if (dashboardMonth) {
        query.set("month", dashboardMonth);
      }

      const response = await fetch(`/api/metrics/official?${query.toString()}`);
      const { data: payload, errorMessage } = await parseApiResponse<DashboardPayload | { error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !payload) {
        throw new Error(extractApiError(payload, "Não foi possível carregar o dashboard."));
      }

      if (!isDashboardPayload(payload)) {
        throw new Error("Resposta inválida do dashboard.");
      }

      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }, [dashboardMonth]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

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

  useEffect(() => {
    if (!showFilters) return;

    const activeMonth = dashboardMonth || currentMonthKey;
    const parsed = parseMonthKey(activeMonth);
    setPickerYear(parsed.year);
    setPickerMonthIndex(parsed.monthIndex);

    const focusTimer = window.setTimeout(() => {
      filtersMonthButtonRef.current?.focus();
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
  }, [currentMonthKey, dashboardMonth, showFilters]);

  const isMonthFilterActive = dashboardMonth.length > 0;
  const appliedMonthLabel = isMonthFilterActive ? formatMonthLabel(dashboardMonth) : "";
  const fallbackTargetMonthKey = isMonthFilterActive ? dashboardMonth : currentMonthKey;

  const dashboardView = useMemo(() => {
    if (!data) return null;

    const usingReferenceFallback = data.referenceMonth !== fallbackTargetMonthKey;
    const referenceMonthLabel = formatMonthLabel(data.referenceMonth);
    const selectedMonthLabel = formatMonthLabel(fallbackTargetMonthKey);
    const periodDescription = isMonthFilterActive
      ? `período selecionado (${selectedMonthLabel})`
      : usingReferenceFallback
        ? `período de referência (${referenceMonthLabel})`
        : "mês atual";

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
      referenceMonthLabel,
      periodDescription,
      currentPeriod,
      previousPeriod,
      resultProgress,
      netWorthCurrent,
      netWorthVariation,
      netWorthSeries,
      topCategories: data.topCategories.map((item) => ({
        ...item,
        icon: item.icon ?? null
      }))
    };
  }, [data, fallbackTargetMonthKey, isMonthFilterActive, netWorthFilter]);

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

  const applyMonthFilter = useCallback((year: number, monthIndex: number): void => {
    setDashboardMonth(formatMonthKey(year, monthIndex));
    setPickerYear(year);
    setPickerMonthIndex(monthIndex);
    setShowFilters(false);
  }, []);

  const filterButtonLabel = isMonthFilterActive ? `Filtro: ${appliedMonthLabel}` : "Filtros";
  const fallbackTargetMonthLabel = formatMonthLabel(fallbackTargetMonthKey);
  const previousFallbackTargetMonthLabel = formatMonthLabel(previousMonthKey(fallbackTargetMonthKey));
  const fallbackTransactionsHref = buildTransactionsMonthHref(fallbackTargetMonthKey);
  const isReferenceFallbackActive = data ? data.referenceMonth !== fallbackTargetMonthKey : false;
  const hasNoTransactionsInSelectedMonth = Boolean(
    dashboardView &&
      isZeroAmount(dashboardView.currentPeriod.income) &&
      isZeroAmount(dashboardView.currentPeriod.expense) &&
      isZeroAmount(dashboardView.currentPeriod.result)
  );
  const showMonthNotice = isReferenceFallbackActive || hasNoTransactionsInSelectedMonth;
  const fallbackNoticeVariant = isReferenceFallbackActive
    ? isMonthFilterActive
      ? "info"
      : "warning"
    : "info";
  const noticeTitle = `Sem lançamentos em ${fallbackTargetMonthLabel}.`;
  const referenceNoticeMonthLabel = dashboardView?.referenceMonthLabel ?? fallbackTargetMonthLabel;
  const shouldShowReferenceNotice = isReferenceFallbackActive && referenceNoticeMonthLabel !== fallbackTargetMonthLabel;
  const noticeSubtitle = shouldShowReferenceNotice
    ? `Mostrando dados de ${referenceNoticeMonthLabel}.`
    : `Comparando com ${previousFallbackTargetMonthLabel}.`;
  const isCurrentMonthScope = !isMonthFilterActive && data?.isCurrentMonthReference === true;
  const spendingCurrentLabel = isCurrentMonthScope ? "Este mês" : "Período selecionado";
  const spendingPreviousLabel = isCurrentMonthScope ? "Mês passado" : "Mês anterior";

  const actions = useMemo(
    () => (
      <>
        <div className="relative order-first" ref={filtersRootRef}>
          <Button
            type="button"
            variant={showFilters ? "primary" : "outline"}
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={showFilters}
            aria-controls={showFilters ? filtersPopoverId : undefined}
            onClick={() => setShowFilters((previous) => !previous)}
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
              "absolute right-0 top-full z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-2.5 shadow-xl",
              "origin-top-right transition-all duration-150 ease-out",
              showFilters
                ? "visible translate-y-0 scale-100 opacity-100 pointer-events-auto"
                : "invisible -translate-y-1 scale-95 opacity-0 pointer-events-none"
            ].join(" ")}
          >
            <div className="space-y-0.5">
              <h3 className="text-[13px] font-semibold">Filtro do dashboard</h3>
              <p className="text-[11px] text-muted-foreground">Selecione mês e ano sem abrir listas grandes.</p>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 px-1.5 py-0.5">
              <button
                type="button"
                aria-label="Ano anterior"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setPickerYear((current) => current - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold tabular-nums">{pickerYear}</span>
              <button
                type="button"
                aria-label="Próximo ano"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setPickerYear((current) => current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1">
              {MONTH_GRID.map((month) => {
                const isSelected = month.monthIndex === pickerMonthIndex;
                const isCurrentMonth =
                  pickerYear === currentMonthParsed.year && month.monthIndex === currentMonthParsed.monthIndex;

                return (
                  <button
                    key={month.monthIndex}
                    ref={month.monthIndex === pickerMonthIndex ? filtersMonthButtonRef : undefined}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => applyMonthFilter(pickerYear, month.monthIndex)}
                    className={[
                      "h-7 rounded-lg border text-[11px] font-medium transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                      isCurrentMonth && !isSelected ? "border-primary/40" : ""
                    ].join(" ")}
                  >
                    {month.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDashboardMonth("");
                  setShowFilters(false);
                }}
              >
                Sem filtro
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyMonthFilter(currentMonthParsed.year, currentMonthParsed.monthIndex)}
              >
                Este mês
              </Button>
            </div>
          </section>
        </div>
        <NotificationsBell
          insights={activeNotifications}
          isLoading={insightsLoading}
          dismissedCount={dismissedInsights.size}
          onDismissInsight={handleDismissInsight}
          onSnoozeInsight={handleSnoozeInsight}
          onClearDismissed={handleClearDismissed}
        />
      </>
    ),
    [
      activeNotifications,
      applyMonthFilter,
      currentMonthParsed.monthIndex,
      currentMonthParsed.year,
      dismissedInsights.size,
      filterButtonLabel,
      filtersPopoverId,
      handleClearDismissed,
      handleDismissInsight,
      handleSnoozeInsight,
      insightsLoading,
      pickerMonthIndex,
      pickerYear,
      showFilters,
    ]
  );

  return (
    <PageShell title="Dashboard" subtitle="Aqui está uma visão geral das suas finanças" actions={actions}>
      <div className="space-y-4">
        {loading ? (
          <DashboardLoading />
        ) : !data || !dashboardView ? (
          <FeedbackMessage variant="error">{error || "Não foi possível carregar os dados do dashboard."}</FeedbackMessage>
        ) : (
          <div className="space-y-6">
            {showMonthNotice ? (
              <FeedbackMessage
                variant={fallbackNoticeVariant}
                className={[
                  "!rounded-lg !px-3 !py-2",
                  isReferenceFallbackActive
                    ? isMonthFilterActive
                      ? "!bg-muted/55 !text-muted-foreground"
                      : "!bg-amber-50/45 !text-amber-800 dark:!bg-amber-950/25 dark:!text-amber-200"
                    : "!bg-muted/55 !text-muted-foreground"
                ].join(" ")}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 opacity-90" aria-hidden="true">
                      {isReferenceFallbackActive && !isMonthFilterActive ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Info className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-5">{noticeTitle}</p>
                      <p className="text-xs opacity-85">{noticeSubtitle}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={fallbackTransactionsHref}
                      className="inline-flex h-7 items-center rounded-full border border-current/20 px-2.5 text-xs font-medium transition hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver transações do mês
                    </Link>
                    {isMonthFilterActive ? (
                      <button
                        type="button"
                        className="inline-flex h-7 items-center rounded-full border border-current/20 px-2.5 text-xs font-medium transition hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setDashboardMonth("");
                          setShowFilters(false);
                        }}
                      >
                        Limpar filtro
                      </button>
                    ) : null}
                  </div>
                </div>
              </FeedbackMessage>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-12">
              <div className="xl:col-span-7">
                <SpendingPaceCard
                  chartAccumulatedData={data.spendingTrend}
                  chartDailyData={data.spendingTrendDaily}
                  compareUntilDay={data.spendingTrendMeta?.compareUntilDay}
                  currentLabel={spendingCurrentLabel}
                  previousLabel={spendingPreviousLabel}
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
      </div>
    </PageShell>
  );
}
