import React from 'react';
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { TrendingUp, ShieldCheck, Globe } from 'lucide-react';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import type { AccountDTO } from '@/lib/types';
import type { NetWorthEntryDTO } from '@/src/features/networth/types';
import { normalizeDateKey } from '@/src/features/shared/utils/dateKey';
import { buildHistorySeries } from '@/src/features/networth/utils/buildHistorySeries';
import { calculateAllocationItems } from '@/src/features/networth/utils/calculateAllocation';
import { deriveSnapshotFromAccounts } from '@/src/features/networth/utils/calculateNetWorth';
import { EmptyState } from '@/src/app-shell/components/EmptyState';
import { Skeleton } from '@/src/app-shell/components/ShellSkeleton';
import { formatCurrency, formatPercent } from '@/src/app-shell/utils';

interface WealthProps {
  hideValues: boolean;
}

export { Wealth as NetWorthPage };

type DashboardMetricsResponse = {
  view: 'dashboard';
  periodComparison: {
    current: {
      expense: number;
    };
  };
};

type PortfolioRow = {
  name: string;
  allocation: number;
  averageValue: number;
  currentValue: number;
  resultPercent: number;
  typeLabel: string;
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

function isInternationalName(value: string): boolean {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (
    normalized.includes('ivvb') ||
    normalized.includes('usd') ||
    normalized.includes('nasdaq') ||
    normalized.includes('sp500') ||
    normalized.includes('crypto') ||
    normalized.includes('bitcoin') ||
    normalized.includes('ethereum') ||
    normalized.includes('global')
  );
}

function buildPortfolioRows(entries: NetWorthEntryDTO[], accounts: AccountDTO[]): PortfolioRow[] {
  const latestDateKey = entries.length > 0 ? normalizeDateKey(entries[entries.length - 1].date) : null;
  const assetEntries = latestDateKey
    ? entries.filter((entry) => entry.type === 'asset' && normalizeDateKey(entry.date) === latestDateKey)
    : [];

  if (assetEntries.length > 0) {
    const grouped = new Map<string, number>();
    const firstValueMap = new Map<string, number>();

    for (const entry of entries.filter((item) => item.type === 'asset')) {
      const current = grouped.get(entry.name) ?? 0;
      if (normalizeDateKey(entry.date) === latestDateKey) {
        grouped.set(entry.name, current + Math.max(entry.value, 0));
      }
      if (!firstValueMap.has(entry.name)) {
        firstValueMap.set(entry.name, Math.max(entry.value, 0));
      }
    }

    const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
    return [...grouped.entries()]
      .map(([name, currentValue]) => {
        const averageValue = firstValueMap.get(name) ?? currentValue;
        const resultPercent = averageValue > 0 ? Number((((currentValue - averageValue) / averageValue) * 100).toFixed(1)) : 0;
        return {
          name,
          allocation: total > 0 ? Number(((currentValue / total) * 100).toFixed(1)) : 0,
          averageValue,
          currentValue,
          resultPercent,
          typeLabel: isInternationalName(name) ? 'Ativos Internacionais' : 'Patrimônio'
        };
      })
      .sort((left, right) => right.currentValue - left.currentValue);
  }

  const positiveAccounts = accounts.filter((account) => (account.currentBalance ?? 0) > 0);
  const total = positiveAccounts.reduce((sum, account) => sum + (account.currentBalance ?? 0), 0);

  return positiveAccounts.map((account) => {
    const currentValue = account.currentBalance ?? 0;
    return {
      name: account.name,
      allocation: total > 0 ? Number(((currentValue / total) * 100).toFixed(1)) : 0,
      averageValue: currentValue,
      currentValue,
      resultPercent: 0,
      typeLabel: account.type === 'investment' ? 'Investimentos' : 'Liquidez'
    };
  });
}

function hasWealthData(snapshotNet: number, allocationLength: number, historyLength: number): boolean {
  return Math.abs(snapshotNet) > 0 || allocationLength > 0 || historyLength > 0;
}

export function Wealth({ hideValues }: WealthProps) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [accounts, setAccounts] = React.useState<AccountDTO[]>([]);
  const [entries, setEntries] = React.useState<NetWorthEntryDTO[]>([]);
  const [monthlyExpense, setMonthlyExpense] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [accountsResponse, netWorthResponse, dashboardResponse] = await Promise.all([
        fetch('/api/accounts', { cache: 'no-store' }),
        fetch('/api/net-worth', { cache: 'no-store' }),
        fetch('/api/metrics/official?view=dashboard', { cache: 'no-store' })
      ]);

      const [
        { data: accountsData, errorMessage: accountsError },
        { data: netWorthData, errorMessage: netWorthError },
        { data: dashboardData, errorMessage: dashboardError }
      ] = await Promise.all([
        parseApiResponse<AccountDTO[] | { error?: unknown }>(accountsResponse),
        parseApiResponse<NetWorthEntryDTO[] | { error?: unknown }>(netWorthResponse),
        parseApiResponse<DashboardMetricsResponse | { error?: unknown }>(dashboardResponse)
      ]);

      if (accountsError) throw new Error(accountsError);
      if (!accountsResponse.ok || !accountsData || !Array.isArray(accountsData)) {
        throw new Error(extractApiError(accountsData, 'Não foi possível carregar as contas.'));
      }

      if (netWorthError) throw new Error(netWorthError);
      if (!netWorthResponse.ok || !netWorthData || !Array.isArray(netWorthData)) {
        throw new Error(extractApiError(netWorthData, 'Não foi possível carregar o patrimônio.'));
      }

      if (dashboardError) throw new Error(dashboardError);
      if (!dashboardResponse.ok || !dashboardData || !('view' in dashboardData) || dashboardData.view !== 'dashboard') {
        throw new Error(extractApiError(dashboardData, 'Não foi possível carregar os indicadores de patrimônio.'));
      }

      setAccounts(accountsData);
      setEntries(netWorthData);
      setMonthlyExpense(dashboardData.periodComparison.current.expense);
    } catch (loadError) {
      setAccounts([]);
      setEntries([]);
      setMonthlyExpense(0);
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar patrimônio.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const snapshot = React.useMemo(() => deriveSnapshotFromAccounts(accounts), [accounts]);
  const allocationItems = React.useMemo(
    () => calculateAllocationItems(entries, entries.length > 0 ? normalizeDateKey(entries[entries.length - 1].date) : null, 'asset', { accounts }),
    [accounts, entries]
  );
  const historySeries = React.useMemo(() => buildHistorySeries(entries), [entries]);
  const chartSeries = React.useMemo(() => {
    if (historySeries.length > 0) {
      return historySeries.map((point) => ({
        date: point.date,
        balance: point.net
      }));
    }

    return snapshot.net !== 0
      ? [{ date: new Date().toISOString().slice(0, 10), balance: snapshot.net }]
      : [];
  }, [historySeries, snapshot.net]);
  const portfolioRows = React.useMemo(() => buildPortfolioRows(entries, accounts), [accounts, entries]);
  const liquidAssets = React.useMemo(
    () => accounts
      .filter((account) => account.type === 'checking' || account.type === 'cash')
      .reduce((sum, account) => sum + Math.max(account.currentBalance ?? 0, 0), 0),
    [accounts]
  );
  const emergencyMonths = monthlyExpense > 0 ? Number((liquidAssets / monthlyExpense).toFixed(1)) : 0;
  const emergencyProgress = monthlyExpense > 0 ? Math.min((liquidAssets / (monthlyExpense * 6)) * 100, 100) : 0;
  const internationalValue = React.useMemo(() => {
    return portfolioRows
      .filter((row) => isInternationalName(row.name))
      .reduce((sum, row) => sum + row.currentValue, 0);
  }, [portfolioRows]);
  const totalAssets = React.useMemo(() => allocationItems.reduce((sum, item) => sum + item.value, 0), [allocationItems]);
  const internationalExposure = totalAssets > 0 ? Number(((internationalValue / totalAssets) * 100).toFixed(1)) : 0;
  const hasData = hasWealthData(snapshot.net, allocationItems.length, historySeries.length);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="glass-card h-[420px]" />
        <Skeleton className="glass-card h-[360px]" />
        <Skeleton className="glass-card h-[320px]" />
      </div>
    );
  }

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

  if (!hasData) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={TrendingUp}
          title="Patrimônio ainda sem dados"
          description="Cadastre contas, ativos ou passivos para acompanhar a evolução do patrimônio."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Patrimônio</h1>
          <p className="text-muted-foreground text-sm">Visão estratégica de longo prazo e alocação de ativos</p>
        </div>
        <div className="flex items-center gap-2 text-success text-xs font-bold tracking-wide bg-success/10 px-3 py-1.5 rounded-lg border border-success/20 shadow-sm">
          <TrendingUp size={16} />
          {(snapshot.net >= 0 ? '+' : '')}{formatPercent(totalAssets > 0 ? (snapshot.net / Math.max(totalAssets, 1)) * 100 : 0)} este ano
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 glass-card p-6 sm:p-8 flex flex-col items-center justify-center text-center">
          <h2 className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-6">Patrimônio Líquido Total</h2>
          <div className="relative w-full aspect-square max-w-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={allocationItems}
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={95}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={4}
                >
                  {allocationItems.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(value) => `R$ ${Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
              </RePieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                {hideValues ? '••••••' : formatCurrency(snapshot.net, false)}
              </div>
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Consolidado</div>
            </div>
          </div>

          <div className="w-full mt-8 space-y-3">
            {allocationItems.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-secondary transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground text-xs font-medium">{item.name}</span>
                </div>
                <span className="font-mono font-semibold text-foreground">{formatPercent(item.weight)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6 flex flex-col">
          <div className="glass-card p-6 sm:p-8 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">Evolução Histórica</h2>
              <div className="flex items-center gap-4 text-[10px] font-medium tracking-wide">
                <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-info shadow-[0_0_8px_hsl(var(--info) / 0.4)]" />
                  <span className="text-muted-foreground">Crescimento</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries}>
                  <defs>
                    <linearGradient id="wealthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    formatter={(value) => `R$ ${Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="hsl(var(--info))"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#wealthGradient)"
                    activeDot={{ r: 6, fill: 'hsl(var(--info))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 shadow-sm">
                <ShieldCheck size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Reserva de Emergência</h3>
                <p className="text-xs text-foreground/70 mb-4 leading-relaxed">Você possui {emergencyMonths.toFixed(1)} meses de cobertura para seus custos fixos atuais.</p>
                <div className="h-1.5 bg-card rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-info shadow-[0_0_8px_hsl(var(--info) / 0.4)]" style={{ width: `${emergencyProgress}%` }} />
                </div>
              </div>
            </div>
            <div className="glass-card p-6 flex items-start gap-4">
              <div className="p-3 bg-success/10 rounded-xl text-success border border-success/20 shadow-sm">
                <Globe size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Exposição Cambial</h3>
                <p className="text-xs text-foreground/70 mb-4 leading-relaxed">{internationalExposure}% do seu patrimônio está alocado em ativos internacionais identificados.</p>
                <div className="h-1.5 bg-card rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-success shadow-[0_0_8px_hsl(var(--success) / 0.35)]" style={{ width: `${internationalExposure}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-border bg-card/30">
          <h2 className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">Ativos em Carteira</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ativo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Alocação</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Preço Médio</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Valor Atual</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {portfolioRows.map((row) => (
                <tr key={row.name} className="hover:bg-secondary transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{row.name}</div>
                    <div className="text-muted-foreground text-[10px] uppercase tracking-widest mt-1">{row.typeLabel}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-muted-foreground">{row.allocation.toFixed(1)}%</td>
                  <td className="px-6 py-4 text-sm text-right font-mono text-muted-foreground">{formatCurrency(row.averageValue, hideValues)}</td>
                  <td className="px-6 py-4 text-sm text-right font-semibold font-mono text-foreground">{formatCurrency(row.currentValue, hideValues)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`${row.resultPercent >= 0 ? 'text-success bg-success/10 border-success/20' : 'text-error bg-error/10 border-error/20'} text-xs font-bold tracking-wide px-2 py-1 rounded-md border inline-block`}>
                      {(row.resultPercent >= 0 ? '+' : '')}{row.resultPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

