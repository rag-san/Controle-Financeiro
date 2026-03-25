import React from 'react';
import {
  Clock
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { motion } from 'motion/react';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { DashboardSkeleton } from '@/src/app-shell/components/ShellSkeleton';
import { formatCurrency, cn } from '@/src/app-shell/utils';

interface DashboardProps {
  hideValues: boolean;
  onNewTransaction: () => void;
}

export { Dashboard as DashboardPage };

type CategoryRowProps = {
  icon: string;
  color: string;
  name: string;
  current: number;
  previous: number;
  variation: number;
  hideValues: boolean;
};

type DashboardMetricsResponse = {
  view: 'dashboard';
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
  cashflow: Array<{
    month: string;
    income: number;
    expense: number;
    balance: number;
  }>;
};

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card) / 0.96)",
  backdropFilter: "blur(16px)",
  border: "1px solid hsl(var(--border) / 0.9)",
  borderRadius: "16px",
  boxShadow: "0 18px 42px hsl(var(--overlay) / 0.18)"
} as const;

const CHART_TOOLTIP_ITEM_STYLE = {
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  fontWeight: 500
} as const;

const CategoryRow = ({ icon, color, name, current, previous, variation, hideValues }: CategoryRowProps) => {
  const varColor = variation > 0 ? 'text-error bg-error/10' : variation < 0 ? 'text-success bg-success/10' : 'text-muted-foreground bg-secondary/40';
  const varText = variation > 0 ? `+${variation}%` : variation === 0 ? '=' : `${variation}%`;
  const currentWidth = previous > 0 ? (current / previous) * 100 : current > 0 ? 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border/60 py-3 text-sm last:border-0 sm:grid-cols-12 sm:items-center sm:gap-4 sm:py-2">
      <div className="flex items-center gap-3 sm:col-span-4">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
        <span>{icon}</span>
        <span className="truncate text-foreground font-medium">{name}</span>
      </div>
      <div className="geist-mono font-semibold text-foreground sm:col-span-2 sm:text-right">
        {formatCurrency(current, hideValues)}
      </div>
      <div className="flex items-center sm:col-span-3">
        <div className="w-full h-1.5 bg-secondary/40 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full', variation > 0 ? 'bg-error' : 'bg-success')} style={{ width: `${Math.min(currentWidth, 100)}%` }}></div>
        </div>
      </div>
      <div className="sm:col-span-1 sm:text-right">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${varColor}`}>
          {varText}
        </span>
      </div>
      <div className="geist-mono font-medium text-muted-foreground sm:col-span-2 sm:text-right">
        {formatCurrency(previous, hideValues)}
      </div>
    </div>
  );
};

const BigCurrency = ({ value, hideValues, className = "", children }: { value: number, hideValues: boolean, className?: string, children?: React.ReactNode }) => {
  const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return (
    <div className={cn("flex items-baseline gap-1.5 geist-mono text-foreground", className)}>
      <span className="text-lg text-muted-foreground font-medium tracking-normal">R$</span>
      <span className="text-3xl font-semibold tracking-tight">{hideValues ? '••••••' : formatted}</span>
      {children}
    </div>
  );
};

function categoryEmoji(name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('morad') || normalized.includes('alug')) return '🏠';
  if (normalized.includes('merc') || normalized.includes('super')) return '🛒';
  if (normalized.includes('rest') || normalized.includes('aliment')) return '🍔';
  if (normalized.includes('comb') || normalized.includes('transp')) return '⛽';
  if (normalized.includes('internet')) return '🌐';
  return '✨';
}

function filterNetWorthSeries(series: DashboardMetricsResponse['netWorthSeries'], period: string) {
  if (period === 'ALL') return series;
  if (series.length === 0) return [];

  const latest = new Date(`${series[series.length - 1].date}T12:00:00`);
  const start = new Date(latest);

  if (period === '1D') start.setDate(start.getDate() - 1);
  if (period === '1W') start.setDate(start.getDate() - 6);
  if (period === '1M') start.setMonth(start.getMonth() - 1);
  if (period === '3M') start.setMonth(start.getMonth() - 3);
  if (period === 'YTD') start.setMonth(0, 1);
  if (period === '1Y') start.setFullYear(start.getFullYear() - 1);

  return series.filter((item) => new Date(`${item.date}T12:00:00`).getTime() >= start.getTime());
}

function isDashboardEmpty(data: DashboardMetricsResponse | null): boolean {
  if (!data) return true;
  return (
    Math.abs(data.cards.income) === 0 &&
    Math.abs(data.cards.expense) === 0 &&
    Math.abs(data.cards.result) === 0 &&
    Math.abs(data.cards.netWorth) === 0 &&
    data.topCategories.length === 0 &&
    data.spendingTrend.length === 0 &&
    data.netWorthSeries.length === 0
  );
}

export function Dashboard({ hideValues, onNewTransaction }: DashboardProps) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [wealthPeriod, setWealthPeriod] = React.useState('1W');
  const [error, setError] = React.useState('');
  const [data, setData] = React.useState<DashboardMetricsResponse | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/metrics/official?view=dashboard', { cache: 'no-store' });
      const { data: payload, errorMessage } = await parseApiResponse<DashboardMetricsResponse | { error?: unknown }>(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !payload || !('view' in payload) || payload.view !== 'dashboard') {
        throw new Error(extractApiError(payload, 'Não foi possível carregar o dashboard.'));
      }

      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const spendingView = React.useMemo(() => {
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

  const filteredNetWorthSeries = React.useMemo(() => filterNetWorthSeries(data?.netWorthSeries ?? [], wealthPeriod), [data, wealthPeriod]);
  const hasNetWorthSeries = filteredNetWorthSeries.length >= 2;
  const resultProgress = React.useMemo(() => {
    const income = data?.periodComparison.current.income ?? 0;
    const expense = data?.periodComparison.current.expense ?? 0;
    if (income <= 0) return 0;
    return Math.max(0, Math.min((expense / income) * 100, 100));
  }, [data]);

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm text-error mb-4">{error}</p>
        <button
          onClick={() => void load()}
          className="bg-primary hover:bg-primary/90 text-background px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (isDashboardEmpty(data)) {
    return (
      <div className="glass-card p-10 text-center space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Seu dashboard ainda não tem dados</h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Importe transações ou adicione movimentações manualmente para liberar os insights principais.
        </p>
        <button
          onClick={onNewTransaction}
          className="bg-primary hover:bg-primary/90 text-background px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Adicionar transação
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="mb-6 flex flex-col gap-2 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Bem-vindo de volta, Gabriel</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Aqui está uma visão geral das suas finanças</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ritmo de Gastos</h2>
            <a href="/transactions" className="text-xs text-primary hover:underline">Ver todas ↗</a>
          </div>
          <div className="mb-6">
            <BigCurrency value={Math.abs(spendingView.delta)} hideValues={hideValues}>
              <span className="text-lg text-muted-foreground font-sans font-medium tracking-normal ml-1">
                {spendingView.delta >= 0 ? 'abaixo' : 'acima'}
              </span>
            </BigCurrency>
            <div className="flex items-center gap-2 text-xs mt-3">
              <span className="text-success bg-success/10 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                {spendingView.deltaPercent >= 0 ? '↓' : '↑'} {Math.abs(spendingView.deltaPercent)}%
              </span>
              <span className="text-muted-foreground">vs {formatCurrency(spendingView.previousSpent, hideValues)} mês anterior</span>
            </div>
          </div>
          <div className="mt-4 h-[220px] w-full sm:h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.spendingTrend ?? []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="paceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="hsl(var(--border) / 0.22)" vertical={false} />
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
                  tickFormatter={(value) => value === 0 ? 'R$ 0' : `R$ ${Number(value)/1000}k`}
                  dx={-5}
                  width={45}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const point = payload[0]?.payload as { current: number; previous: number } | undefined;
                      if (!point) return null;
                      const diff = point.previous - point.current;
                      return (
                        <div className="min-w-[12rem] rounded-2xl border border-border/90 bg-card/95 px-3 py-2 text-xs shadow-[0_18px_42px_hsl(var(--overlay)/0.18)] backdrop-blur">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {label ?? 'Dia'}
                          </p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[13px] text-foreground/90">
                              {diff >= 0 ? 'abaixo' : 'acima'}
                            </span>
                            <span className={`font-semibold ${diff >= 0 ? 'text-success' : 'text-error'}`}>
                              {formatCurrency(Math.abs(diff), hideValues)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="previous" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} name="Mês passado" />
                <Area type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#paceGradient)" activeDot={{ r: 5, fill: 'hsl(var(--accent))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} dot={false} name="Este mês" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center gap-4 pl-0 text-xs text-muted-foreground sm:justify-start sm:pl-10">
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-primary"></div> Este mês</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-border/50 border-t border-dashed border-border/50"></div> Mês passado</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 flex flex-col"
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Patrimônio</h2>
            <a href="/net-worth" className="text-xs text-primary hover:underline">Ver todas ↗</a>
          </div>
          <div className="mb-6">
            <BigCurrency value={data?.cards.netWorth ?? 0} hideValues={hideValues} />
            <div className="flex items-center gap-2 text-xs mt-3">
              <span className="text-success bg-success/10 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                ↑ {formatCurrency(data?.netWorthDelta ?? 0, hideValues)}
              </span>
            </div>
          </div>
          {hasNetWorthSeries ? (
            <div className="min-h-[220px] flex-1 sm:min-h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredNetWorthSeries}>
                  <defs>
                    <linearGradient id="dashboardNetWorthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.22)" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    formatter={(value) => formatCurrency(Number(value ?? 0), hideValues)}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--info))" strokeWidth={3} fillOpacity={1} fill="url(#dashboardNetWorthGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-secondary/40 flex items-center justify-center mb-3">
                <Clock size={20} />
              </div>
              <p className="text-sm">Dados disponíveis após 7 dias</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'].map(period => (
              <button
                key={period}
                onClick={() => setWealthPeriod(period)}
                className={`text-[10px] font-medium px-3 py-1.5 rounded-full transition-colors ${wealthPeriod === period ? 'bg-primary text-foreground' : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/80'}`}
              >
                {period}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 lg:col-span-1"
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Resultado Parcial</h2>
            <a href="/cashflow" className="text-xs text-primary hover:underline">fluxo de caixa ↗</a>
          </div>
          <div className="mb-8">
            <BigCurrency value={data?.cards.result ?? 0} hideValues={hideValues} />
            <div className="flex items-center gap-2 text-xs mt-3">
              <span className={cn('px-2 py-0.5 rounded flex items-center gap-1 font-medium', (data?.cards.resultDelta ?? 0) >= 0 ? 'text-success bg-success/10' : 'text-error bg-error/10')}>
                {(data?.cards.resultDelta ?? 0) >= 0 ? '↑' : '↓'} {Math.abs(data?.cards.resultDelta ?? 0)}%
              </span>
              <span className="text-muted-foreground">vs {formatCurrency(data?.periodComparison.previous.result ?? 0, hideValues)} mês anterior</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="w-full h-2 bg-secondary/40 rounded-full overflow-hidden flex">
              <div className="bg-primary h-full" style={{ width: `${resultProgress}%` }}></div>
              <div className="bg-secondary h-full" style={{ width: `${100 - resultProgress}%` }}></div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 sm:gap-1">
              <div>
                <div className="text-muted-foreground text-[10px] mb-1 font-medium uppercase tracking-wider">Receita</div>
                <div className="geist-mono font-semibold text-sm text-foreground">{formatCurrency(data?.periodComparison.current.income ?? 0, hideValues)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-[10px] mb-1 font-medium uppercase tracking-wider">Gasto</div>
                <div className="geist-mono font-semibold text-sm text-foreground">{formatCurrency(data?.periodComparison.current.expense ?? 0, hideValues)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-[10px] mb-1 font-medium uppercase tracking-wider">Excluído</div>
                <div className="geist-mono font-medium text-sm text-muted-foreground">{formatCurrency(data?.periodComparison.current.excluded ?? 0, hideValues)}</div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6 lg:col-span-2"
        >
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Principais Categorias</h2>
            <a href="/categories" className="text-xs text-primary hover:underline">Ver mais ↗</a>
          </div>

          <div className="space-y-2">
            <div className="mb-4 hidden grid-cols-12 gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:grid">
              <div className="col-span-4">Categoria</div>
              <div className="col-span-2 text-right">Atual</div>
              <div className="col-span-3 text-center">vs Mês Anterior</div>
              <div className="col-span-1 text-right">Variação</div>
              <div className="col-span-2 text-right">Anterior</div>
            </div>

            {data?.topCategories.length ? data.topCategories.map((category) => (
              <CategoryRow
                key={category.categoryId}
                icon={categoryEmoji(category.name)}
                color={category.color}
                name={category.name}
                current={category.current}
                previous={category.previous}
                variation={Number(category.variation.toFixed(0))}
                hideValues={hideValues}
              />
            )) : (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem categorias com movimentação no período.</div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

