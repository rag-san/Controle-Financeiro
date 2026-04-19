"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Banknote, PieChart as PieChartIcon, Repeat2, Store, TrendingUp } from "lucide-react";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import type { FinancialBreakdown } from "@/lib/finance/financial-breakdown";
import type { ReportsPeriodPreset } from "@/src/features/reports/types";
import { fetchJsonOrThrow } from "@/src/features/shared/fetch";

type ReportsResponse = {
  view: "reports";
  period: {
    current: { label: string };
    previous: { label: string };
  };
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  model: {
    currentTotals: { income: number; expense: number; net: number };
    previousTotals: { income: number; expense: number; net: number };
    cashSummary: {
      inflow: number;
      outflow: number;
      net: number;
      previousInflow: number;
      previousOutflow: number;
      previousNet: number;
      cashBalance: number;
    };
    financeBreakdown?: FinancialBreakdown;
    categorySpending: Array<{ categoryId: string | null; name: string; value: number; share: number; color: string }>;
    topMerchants: Array<{ merchantKey: string; merchantLabel: string; total: number; count: number }>;
    recurringDetected: Array<{ merchantKey: string; merchantLabel: string; estimatedMonthlyCost: number; nextExpectedDate: string | null; occurrences: number }>;
    timeSeries: Array<{ key: string; label: string; income: number; expense: number; net: number }>;
    sankey: {
      totalIncome: number;
      totalExpense: number;
      netSaved: number;
      hiddenOperationalExpense: number;
      hiddenOperationalCount: number;
    };
    hasCurrentData: boolean;
  };
};

const PRESET_OPTIONS: ReportsPeriodPreset[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

function savingsRate(income: number, net: number): number {
  if (!income) return 0;
  return Number(((net / income) * 100).toFixed(1));
}

export function ReportsPage(): React.JSX.Element {
  const { hideValues } = useAppShell();
  const [preset, setPreset] = useState<ReportsPeriodPreset>("3M");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ReportsResponse | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError("");
    try {
      const query = new URLSearchParams({ view: "reports", preset });
      if (accountId) query.set("accountId", accountId);
      if (categoryId) query.set("categoryId", categoryId);
      const payload = await fetchJsonOrThrow<ReportsResponse>(`/api/metrics/official?${query.toString()}`);
      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }, [accountId, categoryId, preset]);

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

  const categoryDonut = useMemo(() => (data?.model.categorySpending ?? []).slice(0, 6), [data]);
  const merchants = useMemo(() => (data?.model.topMerchants ?? []).slice(0, 6), [data]);
  const recurring = useMemo(() => (data?.model.recurringDetected ?? []).slice(0, 6), [data]);
  const currentTotals = data?.model.currentTotals;
  const previousTotals = data?.model.previousTotals;
  const financeBreakdown = data?.model.financeBreakdown;
  const rate = savingsRate(currentTotals?.income ?? 0, currentTotals?.net ?? 0);
  const previousRate = savingsRate(previousTotals?.income ?? 0, previousTotals?.net ?? 0);

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

  if (!data || !data.model.hasCurrentData) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={TrendingUp}
          title="Sem dados suficientes para relatórios"
          description="Importe ou registre movimentações para habilitar comparativos, distribuição por categoria e insights."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Relatórios</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.period.current.label} comparado a {data.period.previous.label}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setPreset(option);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  preset === option ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <select value={accountId} onChange={(event) => { setLoading(true); setAccountId(event.target.value); }} className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm outline-none">
            <option value="">Todas as contas</option>
            {data.accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          <select value={categoryId} onChange={(event) => { setLoading(true); setCategoryId(event.target.value); }} className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm outline-none">
            <option value="">Todas as categorias</option>
            {data.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          {(accountId || categoryId) ? (
            <button type="button" onClick={() => { setLoading(true); setAccountId(""); setCategoryId(""); }} className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground">
              Limpar filtros
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2 text-success">
            <Banknote size={18} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Receita</h2>
          </div>
          <div className="geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(data.model.currentTotals.income, hideValues)}</div>
          <div className="mt-2 text-sm text-muted-foreground">Antes: {formatCurrency(data.model.previousTotals.income, hideValues)}</div>
        </div>
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2 text-error">
            <TrendingUp size={18} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Despesa classificada</h2>
          </div>
          <div className="geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(data.model.currentTotals.expense, hideValues)}</div>
          <div className="mt-2 text-sm text-muted-foreground">Antes: {formatCurrency(data.model.previousTotals.expense, hideValues)}</div>
        </div>
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <PieChartIcon size={18} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Resultado</h2>
          </div>
          <div className={cn("geist-mono text-3xl font-semibold tracking-tight", data.model.currentTotals.net >= 0 ? "text-foreground" : "text-error")}>
            {formatCurrency(Math.abs(data.model.currentTotals.net), hideValues)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">Taxa de poupança: {rate.toFixed(1)}%</div>
        </div>
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2 text-info">
            <Store size={18} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Caixa atual</h2>
          </div>
          <div className="geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(data.model.cashSummary.cashBalance, hideValues)}</div>
          <div className="mt-2 text-sm text-muted-foreground">Fluxo líquido: {formatCurrency(data.model.cashSummary.net, hideValues)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="glass-card p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Distribuição por categoria</h2>
          </div>
          {categoryDonut.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
              Sem despesas categorizadas no período.
            </div>
          ) : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryDonut} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4} stroke="none">
                      {categoryDonut.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0), hideValues)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {categoryDonut.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(item.value, hideValues)}</div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{item.share.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="glass-card p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Comparativo por janela</h2>
          </div>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.model.timeSeries} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis hide />
                <Tooltip formatter={(value: number | string | undefined, name?: string) => [formatCurrency(Number(value ?? 0), hideValues), name === "income" ? "Receitas" : name === "expense" ? "Despesas" : "Resultado"]} />
                <Bar dataKey="income" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" fill="hsl(var(--error))" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="glass-card p-6">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Top merchants</h2>
          <div className="space-y-3">
            {merchants.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem merchants suficientes neste período.</div>
            ) : (
              merchants.map((merchant) => (
                <div key={merchant.merchantKey} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{merchant.merchantLabel}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{merchant.count} ocorrências</div>
                  </div>
                  <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(merchant.total, hideValues)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Recorrências detectadas</h2>
          <div className="space-y-3">
            {recurring.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum padrão recorrente detectado.</div>
            ) : (
              recurring.map((item) => (
                <div key={item.merchantKey} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Repeat2 size={14} className="text-primary" />
                      {item.merchantLabel}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.occurrences} ocorrências
                      {item.nextExpectedDate ? ` • próximo em ${new Date(item.nextExpectedDate).toLocaleDateString("pt-BR")}` : ""}
                    </div>
                  </div>
                  <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(item.estimatedMonthlyCost, hideValues)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Fluxo consolidado</h2>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Receita total</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(data.model.sankey.totalIncome, hideValues)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Despesa total</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(data.model.sankey.totalExpense, hideValues)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Despesa paga</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.paidExpense ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">No cartão</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.cardSpending ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Economizado</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(data.model.sankey.netSaved, hideValues)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pagamento de fatura</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.cardPayments ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Fatura aberta</div>
              <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">
                {formatCurrency(financeBreakdown?.openCardDebt ?? 0, hideValues)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Parcelas futuras {formatCurrency(financeBreakdown?.futureInstallments ?? 0, hideValues)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operacional oculto</div>
              <div className="mt-2 text-sm text-foreground">
                {formatCurrency(data.model.sankey.hiddenOperationalExpense, hideValues)} em {data.model.sankey.hiddenOperationalCount} categorias operacionais.
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Taxa de poupança</div>
              <div className="mt-2 text-sm text-foreground">
                {rate.toFixed(1)}% agora • {previousRate.toFixed(1)}% antes
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div> : null}
    </div>
  );
}
