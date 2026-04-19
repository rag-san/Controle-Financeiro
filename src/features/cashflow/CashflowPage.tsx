"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import type { CashflowPeriodKey, CashflowViewData } from "@/src/features/cashflow/types";
import { fetchJsonOrThrow } from "@/src/features/shared/fetch";

type CashflowResponse = {
  view: "cashflow";
  data: CashflowViewData;
};

const PERIOD_OPTIONS: Array<{ value: CashflowPeriodKey; label: string }> = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "12m", label: "1Y" }
];

function deltaLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Sem comparação";
  if (value === 0) return "Estável";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(1)}% vs período anterior`;
}

export function CashflowPage(): React.JSX.Element {
  const { hideValues } = useAppShell();
  const [period, setPeriod] = useState<CashflowPeriodKey>("6m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CashflowViewData | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError("");
    try {
      const payload = await fetchJsonOrThrow<CashflowResponse>(`/api/metrics/official?view=cashflow&period=${period}`);
      setData(payload.data);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar fluxo de caixa.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDataChanged = () => {
      setLoading(true);
      void load();
    };

    window.addEventListener("finance-data-changed", onDataChanged);
    return () => window.removeEventListener("finance-data-changed", onDataChanged);
  }, [load]);

  const mainChartData = useMemo(() => {
    const incomeByMonth = new Map(data?.incomeChart.map((item) => [item.month, item.income]) ?? []);
    return (data?.netChart ?? []).map((item) => {
      const income = incomeByMonth.get(item.month) ?? 0;
      return {
        month: item.month,
        income,
        expense: Math.max(0, Number((income - item.net).toFixed(2))),
        net: item.net
      };
    });
  }, [data]);
  const financeBreakdown = data?.financeBreakdown;

  const hasData = Boolean(
    data &&
      (data.income.current !== 0 ||
        data.expense.current !== 0 ||
        data.netResult.current !== 0 ||
        mainChartData.length > 0)
  );

  if (loading) return <PageSkeleton />;

  if (error && !data) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="mb-4 text-sm text-error">{error}</p>
        <button onClick={() => { setLoading(true); void load(); }} className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!hasData || !data) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Wallet}
          title="Sem dados de fluxo de caixa"
          description="Importe transações ou registre movimentações para ver entradas, saídas e saldo líquido."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Fluxo de Caixa</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.currentRangeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setLoading(true);
                setPeriod(option.value);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                period === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="glass-card p-6 sm:p-8">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Resultado líquido</div>
            <div className={cn("mt-2 geist-mono text-5xl font-semibold tracking-tight", data.netResult.current >= 0 ? "text-foreground" : "text-error")}>
              {formatCurrency(Math.abs(data.netResult.current), hideValues)}
            </div>
            <div className={cn("mt-3 text-sm font-medium", (data.netResult.changePercent ?? 0) >= 0 ? "text-success" : "text-error")}>
              {deltaLabel(data.netResult.changePercent)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Saldo de caixa</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">{formatCurrency(data.cashBalance, hideValues)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Período anterior</div>
              <div className="mt-2 text-sm font-medium text-foreground">{data.previousRangeLabel}</div>
            </div>
          </div>
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mainChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => (value === 0 ? "0" : `${Number(value) / 1000}k`)} width={44} />
              <Tooltip formatter={(value: number | string | undefined, name?: string) => [formatCurrency(Number(value ?? 0), hideValues), name === "income" ? "Entradas" : name === "expense" ? "Saídas" : "Resultado"]} />
              <Bar dataKey="income" name="income" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" name="expense" fill="hsl(var(--error))" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Line dataKey="net" name="net" type="monotone" stroke="hsl(var(--info))" strokeWidth={3} dot={{ r: 3, fill: "hsl(var(--info))" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2 text-success">
            <ArrowDownRight size={18} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Receitas</h2>
          </div>
          <div className="geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(data.income.current, hideValues)}</div>
          <div className="mt-2 text-sm text-muted-foreground">{deltaLabel(data.income.changePercent)}</div>
          <div className="mt-6 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.incomeChart} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis hide />
                <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0), hideValues)} />
                <Bar dataKey="income" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2 text-error">
            <ArrowUpRight size={18} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Saídas</h2>
          </div>
          <div className="geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(data.expense.current, hideValues)}</div>
          <div className="mt-2 text-sm text-muted-foreground">{deltaLabel(data.expense.changePercent)}</div>
          <div className="mt-6 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.expensesChart.rows} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis hide />
                <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0), hideValues)} />
                <Bar dataKey="total" fill="hsl(var(--error))" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Leitura oficial</h2>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Receita classificada</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">
                {formatCurrency(data.classifiedIncome?.current ?? data.income.current, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Despesa classificada</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">
                {formatCurrency(data.classifiedExpense?.current ?? data.expense.current, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Despesa paga</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.paidExpense ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">No cartão</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.cardSpending ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pagamento de fatura</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.cardPayments ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Fatura aberta</div>
              <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.openCardDebt ?? 0, hideValues)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Parcelas futuras {formatCurrency(financeBreakdown?.futureInstallments ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Comparação anterior</div>
              <div className="mt-2 text-sm text-foreground">
                Entradas {formatCurrency(data.income.previous, hideValues)} • Saídas {formatCurrency(data.expense.previous, hideValues)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div> : null}
    </div>
  );
}
