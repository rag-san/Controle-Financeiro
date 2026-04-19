"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { NotificationBell } from "@/src/features/dashboard/components/NotificationBell";
import { fetchJsonOrThrow } from "@/src/features/shared/fetch";
import { MonthSelector } from "@/src/features/shared/MonthSelector";
import type { FinancialBreakdown } from "@/lib/finance/financial-breakdown";

type DashboardMetricsResponse = {
  view: "dashboard";
  dashboardCalculationVersion?: number;
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
  periodComparison: {
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
  financeBreakdown?: FinancialBreakdown;
  netWorthDelta: number;
  netWorthSeries: Array<{
    date: string;
    value: number;
  }>;
  spendingTrend: Array<{
    day: number;
    current: number;
    previous: number;
  }>;
  topCategories: Array<{
    categoryId: string;
    name: string;
    color: string;
    icon: string | null;
    current: number;
    previous: number;
    variation: number;
  }>;
};

function categoryEmoji(name: string): string {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("morad") || normalized.includes("alug")) return "🏠";
  if (normalized.includes("merc") || normalized.includes("super")) return "🛒";
  if (normalized.includes("rest") || normalized.includes("aliment")) return "🍔";
  if (normalized.includes("comb") || normalized.includes("transp")) return "⛽";
  if (normalized.includes("internet")) return "🌐";
  if (normalized.includes("saud")) return "💊";
  return "✨";
}

function filterNetWorthSeries(series: DashboardMetricsResponse["netWorthSeries"], period: string) {
  if (period === "ALL") return series;
  if (series.length === 0) return [];

  const latest = new Date(`${series[series.length - 1].date}T12:00:00`);
  const start = new Date(latest);

  if (period === "1D") start.setDate(start.getDate() - 1);
  if (period === "1W") start.setDate(start.getDate() - 6);
  if (period === "1M") start.setMonth(start.getMonth() - 1);
  if (period === "3M") start.setMonth(start.getMonth() - 3);
  if (period === "YTD") start.setMonth(0, 1);
  if (period === "1Y") start.setFullYear(start.getFullYear() - 1);

  return series.filter((item) => new Date(`${item.date}T12:00:00`).getTime() >= start.getTime());
}

function isDashboardEmpty(data: DashboardMetricsResponse | null): boolean {
  if (!data) return true;

  return (
    Math.abs(data.cards.expense) === 0 &&
    Math.abs(data.cards.result) === 0 &&
    Math.abs(data.cards.netWorth) === 0 &&
    Math.abs(data.financeBreakdown?.openCardDebt ?? 0) === 0 &&
    Math.abs(data.financeBreakdown?.futureInstallments ?? 0) === 0 &&
    data.topCategories.length === 0 &&
    data.spendingTrend.length === 0 &&
    data.netWorthSeries.length === 0
  );
}

function BigCurrency({
  value,
  hideValues,
  className = "",
  children
}: {
  value: number;
  hideValues: boolean;
  className?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

  return (
    <div className={cn("geist-mono flex items-baseline gap-1.5 text-foreground", className)}>
      <span className="text-lg font-medium tracking-normal text-muted-foreground">R$</span>
      <span className="text-3xl font-semibold tracking-tight">{hideValues ? "••••••" : formatted}</span>
      {children}
    </div>
  );
}

function CategoryRow({
  name,
  current,
  variation,
  color,
  hideValues
}: {
  name: string;
  current: number;
  variation: number;
  color: string;
  hideValues: boolean;
}): React.JSX.Element {
  const isBad = variation > 0;
  const label =
    variation > 0 ? `↑ ${Math.round(Math.abs(variation))}%` : variation < 0 ? `↓ ${Math.round(Math.abs(variation))}%` : "=";

  return (
    <div className="flex cursor-pointer items-center justify-between rounded-lg border-b border-border py-3 transition-colors last:border-0 hover:bg-secondary/60">
      <div className="flex items-center gap-3 overflow-hidden px-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}20`, color }}>
          <span className="text-sm">{categoryEmoji(name)}</span>
        </div>
        <span className="truncate font-medium text-foreground">{name}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-2">
        <div className="geist-mono text-right font-semibold text-foreground">{formatCurrency(current, hideValues)}</div>
        <div
          className={cn(
            "w-14 rounded px-1.5 py-0.5 text-center text-[10px] font-medium",
            variation === 0 ? "bg-secondary text-muted-foreground" : isBad ? "bg-error/10 text-error" : "bg-success/10 text-success"
          )}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export function DashboardPage(): React.JSX.Element {
  const { hideValues, openTransactionModal } = useAppShell();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [wealthPeriod, setWealthPeriod] = useState("1W");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardMetricsResponse | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const month = format(selectedMonth, "yyyy-MM");
      const query = new URLSearchParams({
        view: "dashboard",
        month
      });
      const payload = await fetchJsonOrThrow<DashboardMetricsResponse>(`/api/metrics/official?${query.toString()}`);
      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDataChanged = (): void => {
      void load();
    };
    window.addEventListener("finance-data-changed", onDataChanged);
    return () => window.removeEventListener("finance-data-changed", onDataChanged);
  }, [load]);

  const filteredNetWorthSeries = useMemo(() => filterNetWorthSeries(data?.netWorthSeries ?? [], wealthPeriod), [data, wealthPeriod]);
  const hasNetWorthSeries = filteredNetWorthSeries.length >= 2;
  const financeBreakdown = data?.financeBreakdown;
  const spendingView = useMemo(() => {
    const lastPoint = data?.spendingTrend[data.spendingTrend.length - 1];
    const currentSpent = lastPoint?.current ?? data?.periodComparison.current.expense ?? 0;
    const previousSpent = lastPoint?.previous ?? data?.periodComparison.previous.expense ?? 0;
    const delta = previousSpent - currentSpent;
    const deltaPercent = previousSpent > 0 ? Number((((previousSpent - currentSpent) / previousSpent) * 100).toFixed(1)) : 0;
    return {
      currentSpent,
      previousSpent,
      delta,
      deltaPercent
    };
  }, [data]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="mb-4 text-sm text-error">{error}</p>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (isDashboardEmpty(data)) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Clock}
          title="Seu dashboard ainda nao tem dados"
          description="Importe transacoes ou adicione movimentacoes manualmente para liberar os indicadores principais."
          actionLabel="Adicionar transacao"
          onAction={() => openTransactionModal()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground">
            Visao geral de {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <MonthSelector currentDate={selectedMonth} onChange={setSelectedMonth} />
          <NotificationBell />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="glass-card p-5 sm:p-6 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Saidas reais do periodo</h2>
          </div>
          <div className="mb-4">
            <BigCurrency value={Math.abs(data?.cards.expense ?? 0)} hideValues={hideValues} className="text-4xl sm:text-5xl" />
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className={cn("font-medium", spendingView.delta >= 0 ? "text-success" : "text-error")}>
                {spendingView.delta >= 0 ? "↓" : "↑"} {Math.abs(spendingView.deltaPercent)}% vs mes passado
              </span>
            </div>
          </div>

          <div className="h-[180px] w-full sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.spendingTrend ?? []} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboard-pace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => (value === 0 ? "" : `${Number(value) / 1000}k`)}
                  dx={-10}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card) / 0.96)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid hsl(var(--border) / 0.9)",
                    borderRadius: "12px",
                    boxShadow: "0 18px 42px hsl(var(--overlay) / 0.18)"
                  }}
                  formatter={(value: number | string | undefined, name?: string) => [
                    formatCurrency(Number(value ?? 0), hideValues),
                    name === "current" ? "Atual" : "Mes anterior"
                  ]}
                  labelFormatter={(label) => `Dia ${label}`}
                />
                <Area type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#dashboard-pace)" dot={false} />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card flex flex-col p-5 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Patrimonio</h2>
            <a href="/net-worth" className="text-xs text-primary hover:underline">
              Ver tudo ↗
            </a>
          </div>

          <div className="mb-4">
            <BigCurrency value={data?.cards.netWorth ?? 0} hideValues={hideValues} />
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="rounded bg-success/10 px-2 py-0.5 font-medium text-success">
                ↑ {formatCurrency(data?.netWorthDelta ?? 0, hideValues)}
              </span>
            </div>
          </div>

          {hasNetWorthSeries ? (
            <div className="min-h-[180px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredNetWorthSeries}>
                  <defs>
                    <linearGradient id="dashboard-net-worth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.22)" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card) / 0.96)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid hsl(var(--border) / 0.9)",
                      borderRadius: "12px",
                      boxShadow: "0 18px 42px hsl(var(--overlay) / 0.18)"
                    }}
                    formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0), hideValues)}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--info))" strokeWidth={3} fill="url(#dashboard-net-worth)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-2 text-muted-foreground">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Clock size={18} />
              </div>
              <p className="text-xs">Dados disponiveis apos 7 dias</p>
            </div>
          )}

          <div className="mt-2 flex justify-center gap-1.5">
            {["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"].map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setWealthPeriod(period)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[10px] font-medium transition-colors",
                  wealthPeriod === period ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card p-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Gasto pago</div>
          <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
            {formatCurrency(financeBreakdown?.paidExpense ?? 0, hideValues)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Saída efetiva de caixa no período.</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">No cartão</div>
          <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
            {formatCurrency(financeBreakdown?.cardSpending ?? 0, hideValues)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Compras classificadas sem caixa imediato.</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Fatura aberta</div>
          <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
            {formatCurrency(financeBreakdown?.openCardDebt ?? 0, hideValues)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Saldo ainda em aberto nos cartões.</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Parcelas futuras</div>
          <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
            {formatCurrency(financeBreakdown?.futureInstallments ?? 0, hideValues)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Compromissos já identificados para frente.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card flex flex-col p-5 sm:p-6 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Resultado do periodo</h2>
            <a href="/cashflow" className="text-xs text-primary hover:underline">
              fluxo ↗
            </a>
          </div>
          <div className="mb-6">
            <BigCurrency value={data?.cards.result ?? 0} hideValues={hideValues} className={cn((data?.cards.result ?? 0) >= 0 ? "text-success" : "text-error")} />
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className={cn("font-medium", (data?.cards.resultDelta ?? 0) >= 0 ? "text-success" : "text-error")}>
                {(data?.cards.resultDelta ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(data?.cards.resultDelta ?? 0)}% vs mes passado
              </span>
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Entradas reais</span>
              <span className="geist-mono font-medium text-foreground">{formatCurrency(data?.periodComparison.current.income ?? 0, hideValues)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Saidas reais</span>
              <span className="geist-mono font-medium text-foreground">{formatCurrency(data?.periodComparison.current.expense ?? 0, hideValues)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-bold">
              <span className="text-foreground">Resultado</span>
              <span className={cn("geist-mono", (data?.cards.result ?? 0) >= 0 ? "text-success" : "text-error")}>
                {formatCurrency(data?.cards.result ?? 0, hideValues)}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Onde voce mais gastou</h2>
            <a href="/categories" className="text-xs text-primary hover:underline">
              Ver mais ↗
            </a>
          </div>

          <div className="space-y-1">
            {data?.topCategories.length ? (
              data.topCategories.map((category) => (
                <CategoryRow
                  key={category.categoryId}
                  name={category.name}
                  current={category.current}
                  variation={category.variation}
                  color={category.color}
                  hideValues={hideValues}
                />
              ))
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">Sem categorias com movimentacao no periodo.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
