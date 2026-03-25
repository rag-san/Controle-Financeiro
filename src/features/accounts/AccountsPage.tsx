import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, RefreshCw, CreditCard, Landmark, Link as LinkIcon } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import type { AccountDTO } from '@/lib/types';
import type { NetWorthEntryDTO, NetWorthRangeKey } from '@/src/features/networth/types';
import { buildDerivedSeriesFromSnapshot, buildHistorySeries, filterHistoryByInterval, resolveRangeInterval } from '@/src/features/networth/utils/buildHistorySeries';
import { deriveSnapshotFromAccounts } from '@/src/features/networth/utils/calculateNetWorth';
import { AssetsDebtsTooltip } from '@/src/components/charts/AssetsDebtsTooltip';
import { EmptyState } from '@/src/app-shell/components/EmptyState';
import { NewAccountModal } from './components/NewAccountModal';
import { Skeleton } from '@/src/app-shell/components/ShellSkeleton';
import { formatCurrency, cn } from '@/src/app-shell/utils';

interface AccountsProps {
  hideValues: boolean;
}

export { Accounts as AccountsPage };

type AccountsChartRow = {
  date: string;
  ativos: number;
  dividas: number;
};

type AccountGroupRow = {
  id: string;
  name: string;
  bank?: string;
  status?: string;
  dueDate?: string;
  balance?: number;
};

type AccountGroup = {
  id: string;
  title: string;
  total: number;
  accounts: AccountGroupRow[];
};

function resolveChartRange(range: string): NetWorthRangeKey {
  if (range === '1W') return '1W';
  if (range === 'YTD') return 'YTD';
  if (range === '3M') return '3M';
  if (range === '1Y') return '1Y';
  if (range === 'ALL') return 'ALL';
  return '1M';
}

function formatChartLabel(dateKey: string, range: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  if (range === '1W' || range === '1M') {
    return format(date, 'dd/MM', { locale: ptBR });
  }

  return format(date, 'MMM', { locale: ptBR })
    .replace('.', '')
    .replace(/^\w/, (value) => value.toUpperCase());
}

function buildAccountGroups(accounts: AccountDTO[]): AccountGroup[] {
  const creditAccounts = accounts.filter((account) => account.type === 'credit');
  const bankAccounts = accounts.filter((account) => account.type !== 'credit');
  const connections = [...new Set(accounts.map((account) => account.institution?.trim()).filter(Boolean))];

  const groups: AccountGroup[] = [];

  if (creditAccounts.length > 0) {
    groups.push({
      id: 'credit',
      title: 'Cartões de Crédito',
      total: creditAccounts.reduce((sum, account) => sum + Math.abs(Math.min(account.currentBalance ?? 0, 0)), 0),
      accounts: creditAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        bank: account.institution ?? 'Cartão Manual',
        balance: account.currentBalance ?? 0
      }))
    });
  }

  if (bankAccounts.length > 0) {
    groups.push({
      id: 'bank',
      title: 'Contas Bancárias',
      total: bankAccounts.reduce((sum, account) => sum + Math.max(account.currentBalance ?? 0, 0), 0),
      accounts: bankAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        bank: account.institution ?? 'Conta Manual',
        balance: account.currentBalance ?? 0
      }))
    });
  }

  if (connections.length > 0) {
    groups.push({
      id: 'connections',
      title: 'Conexões',
      total: 0,
      accounts: connections.map((institution, index) => ({
        id: `connection-${index}`,
        name: institution as string,
        status: 'Conectado'
      }))
    });
  }

  return groups;
}

export function Accounts({ hideValues }: AccountsProps) {
  const [timeRange, setTimeRange] = useState('1M');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [entries, setEntries] = useState<NetWorthEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      const [accountsResponse, netWorthResponse] = await Promise.all([
        fetch('/api/accounts', { cache: 'no-store' }),
        fetch('/api/net-worth', { cache: 'no-store' })
      ]);

      const [{ data: accountsData, errorMessage: accountsError }, { data: entriesData, errorMessage: netWorthError }] = await Promise.all([
        parseApiResponse<AccountDTO[] | { error?: unknown }>(accountsResponse),
        parseApiResponse<NetWorthEntryDTO[] | { error?: unknown }>(netWorthResponse)
      ]);

      if (accountsError) throw new Error(accountsError);
      if (!accountsResponse.ok || !accountsData || !Array.isArray(accountsData)) {
        throw new Error(extractApiError(accountsData, 'Não foi possível carregar as contas.'));
      }

      if (netWorthError) throw new Error(netWorthError);
      if (!netWorthResponse.ok || !entriesData || !Array.isArray(entriesData)) {
        throw new Error(extractApiError(entriesData, 'Não foi possível carregar o histórico das contas.'));
      }

      setAccounts(accountsData);
      setEntries(entriesData);
    } catch (loadError) {
      setAccounts([]);
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar contas.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void load();
  };

  const snapshot = useMemo(() => deriveSnapshotFromAccounts(accounts), [accounts]);
  const groups = useMemo(() => buildAccountGroups(accounts), [accounts]);

  const chartData = useMemo<AccountsChartRow[]>(() => {
    const timeline = buildHistorySeries(entries);
    const referenceDate = timeline.length > 0 ? new Date(`${timeline[timeline.length - 1].date}T12:00:00`) : new Date();
    const currentInterval = resolveRangeInterval(resolveChartRange(timeRange), referenceDate, timeline[0] ? new Date(`${timeline[0].date}T12:00:00`) : undefined);
    const filtered = filterHistoryByInterval(timeline, currentInterval);
    const source =
      filtered.length > 0
        ? filtered
        : buildDerivedSeriesFromSnapshot(snapshot, resolveChartRange(timeRange), currentInterval);

    return source.map((point) => ({
      date: formatChartLabel(point.date, timeRange),
      ativos: point.assets,
      dividas: point.debts
    }));
  }, [entries, snapshot, timeRange]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Contas</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            onClick={handleRefresh}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
            title="Atualizar contas"
            disabled={loading}
          >
            <RefreshCw size={18} className={cn((isRefreshing || loading) && 'animate-spin text-primary')} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-background transition-all duration-200 hover:scale-105 hover:bg-primary/90 active:scale-95 shadow-[0_0_15px_hsl(var(--success) / 0.2)] hover:shadow-[0_0_25px_hsl(var(--success) / 0.4)]"
          >
            <Plus size={18} />
            Nova Conta
          </button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4 sm:space-y-6">
          <Skeleton className="glass-card h-[260px] sm:h-[356px]" />
          <Skeleton className="glass-card h-[220px] sm:h-[280px]" />
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-error mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="bg-primary hover:bg-primary/90 text-background px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="glass-card p-5 sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid grid-cols-2 gap-4 sm:flex sm:gap-8">
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Ativos</div>
                  <div className="text-2xl font-semibold text-foreground">R$ {formatCurrency(snapshot.assets, hideValues).replace('R$', '').trim()}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Dívidas</div>
                  <div className="text-2xl font-semibold text-foreground">R$ {formatCurrency(snapshot.debts, hideValues).replace('R$', '').trim()}</div>
                </div>
              </div>
            </div>

            <div className="mb-6 h-[220px] w-full sm:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorAtivos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.22)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<AssetsDebtsTooltip />} />
                  <Area type="monotone" dataKey="ativos" stroke="hsl(var(--info))" fillOpacity={1} fill="url(#colorAtivos)" />
                  <Area type="monotone" dataKey="dividas" stroke="hsl(var(--error))" fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {['1W', '1M', 'YTD', '3M', '1Y', 'ALL'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    timeRange === range ? 'bg-secondary/80 text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={Landmark}
                title="Nenhuma conta cadastrada"
                description="Crie sua primeira conta para visualizar saldos, cartões e conexões."
                actionLabel="Nova Conta"
                onAction={() => setIsModalOpen(true)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.id} className="glass-card overflow-hidden">
                  <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {group.id === 'credit' && <CreditCard size={16} />}
                      {group.id === 'bank' && <Landmark size={16} />}
                      {group.id === 'connections' && <LinkIcon size={16} />}
                      {group.title}
                    </h3>
                    {group.total > 0 && <span className="text-sm font-medium text-foreground">R$ {formatCurrency(group.total, hideValues).replace('R$', '').trim()}</span>}
                  </div>
                  <div className="divide-y divide-border/60">
                    {group.accounts.map((account) => (
                      <div key={account.id} className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">{account.name}</div>
                          <div className="text-xs text-muted-foreground">{account.bank || account.status} {account.dueDate && `• Vence: ${account.dueDate}`}</div>
                        </div>
                        {account.balance !== undefined && (
                          <div className="text-sm font-medium text-foreground">
                            {account.balance === 0 ? '-R$ 0,00' : `R$ ${formatCurrency(account.balance, hideValues).replace('R$', '').trim()}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <NewAccountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => {
          setIsModalOpen(false);
          void load();
        }}
      />
    </div>
  );
}

