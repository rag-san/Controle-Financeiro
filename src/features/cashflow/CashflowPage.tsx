import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { CashflowPeriodKey, CashflowViewData } from '@/src/features/cashflow/types';
import { useCashflowData } from '@/src/features/cashflow/hooks/useCashflowData';
import { EmptyState } from '@/src/app-shell/components/EmptyState';
import { Skeleton } from '@/src/app-shell/components/ShellSkeleton';
import { cn } from '@/src/app-shell/utils';
import { getCategoryColor } from '@/src/features/categories/categoryColors';

interface CashFlowProps {
  hideValues: boolean;
}

export { CashFlow as CashflowPage };

type TooltipEntry = {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: number;
};

type CashflowChartRow = {
  date: string;
  income: number;
  expense: number;
  balance: number;
  [key: string]: string | number;
};

const PERIOD_MAP: Record<string, CashflowPeriodKey> = {
  '1M': '1m',
  '3M': '3m',
  '6M': '6m',
  '1Y': '12m'
};

function formatMonthLabel(monthKey: string): string {
  const parsed = new Date(`${monthKey}-01T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return parsed.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^\w/, (value) => value.toUpperCase());
}

function hasCashflowData(data: CashflowViewData | null): boolean {
  if (!data) return false;
  return (
    Math.abs(data.netResult.current) > 0 ||
    Math.abs(data.income.current) > 0 ||
    Math.abs(data.expense.current) > 0 ||
    data.netChart.length > 0 ||
    data.incomeChart.length > 0 ||
    data.expensesChart.rows.length > 0
  );
}

function formatValue(value: number, hideValues: boolean): string {
  if (hideValues) return '••••••';
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CustomTooltip({
  active,
  payload,
  label,
  hideValues,
  labelMap
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  hideValues: boolean;
  labelMap: Record<string, string>;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="min-w-[180px] rounded-2xl border border-border/90 bg-card/95 p-4 shadow-[0_18px_42px_hsl(var(--overlay)/0.18)] backdrop-blur">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className="space-y-3">
          {payload.map((entry, index) => {
            const key = String(entry.dataKey ?? entry.name ?? '');
            const labelName = labelMap[key] ?? String(entry.name ?? key);
            return (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn('rounded-full', key === 'balance' ? 'w-3 h-1 rounded-sm' : 'w-2 h-2')}
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs font-medium text-foreground/90">{labelName}</span>
                </div>
                <span className="font-mono text-xs font-semibold text-foreground">
                  {formatValue(Number(entry.value ?? 0), hideValues)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
}

export function CashFlow({ hideValues }: CashFlowProps) {
  const [period, setPeriod] = useState('6M');
  const periodKey = PERIOD_MAP[period] ?? '6m';
  const { data, loading, error } = useCashflowData(periodKey);

  const mainChartData = useMemo<CashflowChartRow[]>(() => {
    if (!data) return [];

    const monthKeys = new Set<string>();
    data.incomeChart.forEach((item) => monthKeys.add(item.month));
    data.netChart.forEach((item) => monthKeys.add(item.month));
    data.expensesChart.rows.forEach((item) => monthKeys.add(item.month));

    let runningBalance = 0;
    return [...monthKeys]
      .sort()
      .map((monthKey) => {
        const income = data.incomeChart.find((item) => item.month === monthKey)?.income ?? 0;
        const expense = data.expensesChart.rows.find((item) => item.month === monthKey)?.total ?? 0;
        const net = data.netChart.find((item) => item.month === monthKey)?.net ?? income - expense;
        runningBalance += net;
        return {
          date: formatMonthLabel(monthKey),
          income,
          expense,
          balance: Number(runningBalance.toFixed(2))
        };
      });
  }, [data]);

  const expenseCategories = useMemo(() => (data?.expensesChart.categories ?? []).slice(0, 4), [data]);
  const labelMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {
      income: 'Entradas',
      expense: 'Saídas',
      balance: 'Saldo acumulado'
    };
    for (const category of expenseCategories) {
      map[category] = category;
    }
    return map;
  }, [expenseCategories]);

  const incomeTrendData = useMemo(() => {
    if (!data) return [];
    return data.incomeChart.map((item) => ({
      date: formatMonthLabel(item.month),
      income: item.income
    }));
  }, [data]);

  const expenseTrendData = useMemo(() => {
    if (!data) return [];
    return data.expensesChart.rows.map((row) => {
      const normalized: CashflowChartRow = {
        date: formatMonthLabel(row.month),
        expense: row.total,
        income: 0,
        balance: 0
      };

                      for (const category of expenseCategories) {
                        normalized[category] = Number(row[category] ?? 0);
                      }

      return normalized;
    });
  }, [data, expenseCategories]);

  const empty = !loading && !error && !hasCashflowData(data);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Fluxo de Caixa</h1>
          <p className="text-muted-foreground text-sm">Acompanhe suas entradas, saídas e evolução do saldo</p>
        </div>
        <div className="flex bg-card p-1 rounded-xl border border-border shadow-sm">
          {['1M', '3M', '6M', '1Y'].map((value) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300',
                period === value
                  ? 'bg-focus text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="glass-card h-[430px]" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="glass-card h-[320px]" />
            <Skeleton className="glass-card h-[320px]" />
          </div>
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-error mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary hover:bg-primary/90 text-background px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      ) : empty ? (
        <div className="glass-card">
          <EmptyState
            icon={TrendingDown}
            title="Sem dados no período"
            description="Importe extratos ou adicione transações para visualizar o fluxo de caixa."
          />
        </div>
      ) : (
        <>
          <div className="glass-card p-6 sm:p-8 relative overflow-hidden">
            <div className="relative z-10 mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div>
                <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Resultado Líquido (Período)</h2>
                <div className="flex flex-wrap items-baseline gap-4">
                  <span className="text-5xl sm:text-6xl font-semibold tracking-tighter text-foreground font-mono leading-none">
                    {hideValues ? '••••••' : formatValue(data?.netResult.current ?? 0, false)}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-3 py-1.5 rounded-lg border border-success/20">
                    <TrendingUp size={14} strokeWidth={2.5} />
                    {(data?.netResult.changePercent ?? 0) >= 0 ? '+' : ''}{(data?.netResult.changePercent ?? 0).toFixed(1)}% vs anterior
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6 bg-card px-4 py-2.5 rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-success" />
                  <span className="text-xs font-medium text-muted-foreground">Entradas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-error" />
                  <span className="text-xs font-medium text-muted-foreground">Saídas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 rounded-full bg-info" />
                  <span className="text-xs font-medium text-muted-foreground">Saldo</span>
                </div>
              </div>
            </div>

            <div className="h-[260px] w-full relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mainChartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.22)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dy={15}
                    fontWeight={500}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `R$ ${Number(val) / 1000}k`}
                    dx={-10}
                    fontWeight={500}
                  />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" opacity={0} hide />
                  <Tooltip
                    content={<CustomTooltip hideValues={hideValues} labelMap={labelMap} />}
                    cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }}
                  />
                  <Bar yAxisId="left" dataKey="income" fill="hsl(var(--success))" radius={[6, 6, 6, 6]} maxBarSize={32} />
                  <Bar yAxisId="left" dataKey="expense" fill="hsl(var(--error))" radius={[6, 6, 6, 6]} maxBarSize={32} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="balance"
                    stroke="hsl(var(--info))"
                    strokeWidth={3}
                    dot={{ r: 4, fill: 'hsl(var(--card))', stroke: 'hsl(var(--info))', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--info))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 sm:p-8 relative overflow-hidden">
              <div className="relative z-10 mb-8 flex justify-between items-start">
                <div>
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Receitas</h3>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-3xl sm:text-4xl font-semibold tracking-tighter text-foreground font-mono leading-none">
                      {hideValues ? '••••••' : formatValue(data?.income.current ?? 0, false)}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-md border border-success/20 w-fit">
                      <TrendingUp size={12} strokeWidth={2.5} />
                      {(data?.income.changePercent ?? 0) >= 0 ? '+' : ''}{(data?.income.changePercent ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="h-[180px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incomeTrendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.22)" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `R$ ${Number(val) / 1000}k`} dx={-10} />
                    <Tooltip content={<CustomTooltip hideValues={hideValues} labelMap={labelMap} />} cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }} />
                    <Bar dataKey="income" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 4, 4]} stroke="hsl(var(--card))" strokeWidth={2} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-6 sm:p-8 relative overflow-hidden">
              <div className="relative z-10 mb-8 flex justify-between items-start">
                <div>
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Gastos</h3>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-3xl sm:text-4xl font-semibold tracking-tighter text-foreground font-mono leading-none">
                      {hideValues ? '••••••' : formatValue(data?.expense.current ?? 0, false)}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-error bg-error/10 px-2 py-1 rounded-md border border-error/20 w-fit">
                      <TrendingDown size={12} strokeWidth={2.5} />
                      {(data?.expense.changePercent ?? 0) >= 0 ? '+' : ''}{(data?.expense.changePercent ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="h-[180px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseTrendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.22)" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `R$ ${Number(val) / 1000}k`} dx={-10} />
                    <Tooltip content={<CustomTooltip hideValues={hideValues} labelMap={labelMap} />} cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }} />
                    {expenseCategories.map((category) => (
                      <Bar
                        key={category}
                        dataKey={category}
                        stackId="a"
                        fill={getCategoryColor(category)}
                        radius={[4, 4, 4, 4]}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                        maxBarSize={24}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

