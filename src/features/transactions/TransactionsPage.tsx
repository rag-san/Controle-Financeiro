import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Plus,
  ChevronDown,
  MoreHorizontal,
  Circle,
  CheckCircle2,
  ArrowDownRight,
  ArrowUpRight,
  ListFilter,
  Tag,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import type { AccountDTO, CategoryDTO, TransactionDTO } from '@/lib/types';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import { formatCurrency, cn } from '@/src/app-shell/utils';

interface TransactionsProps {
  hideValues: boolean;
  onNewTransaction: (transaction?: TransactionDTO | null) => void;
  onImport?: () => void;
}

export { Transactions as TransactionsPage };

type TransactionsResponse = {
  items: TransactionDTO[];
  summary?: {
    income: number;
    expense: number;
    balance: number;
    cashBalance?: number;
  };
  meta?: {
    accounts: AccountDTO[];
    categories: CategoryDTO[];
  };
};

const PERIOD_LABELS = ['Últimos 7 dias', 'Últimos 30 dias', 'Este mês', 'Mês passado', 'Este ano'] as const;
const TYPE_LABELS = ['Todas as Transações', 'Apenas Receitas', 'Apenas Despesas'] as const;

type TransactionsPeriodMode =
  | '7d'
  | '30d'
  | '90d'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'all'
  | 'custom';

type TransactionsPeriodSelection = {
  mode: TransactionsPeriodMode;
  label: (typeof PERIOD_LABELS)[number];
  from?: string;
  to?: string;
};

type TransactionsRouteState = {
  period: TransactionsPeriodSelection;
  typeLabel: (typeof TYPE_LABELS)[number];
  categoryId: string;
  uncategorizedOnly: boolean;
  accountId: string;
  excludedOnly: boolean;
  searchQuery: string;
};

type TransactionsRefreshInput = {
  refreshing: boolean;
  page: number;
  debouncedQuery: string;
  filters: {
    accountId: string;
    categoryId: string;
    type: '' | 'income' | 'expense' | 'transfer';
    period: '7d' | '30d' | '90d' | 'this-month' | 'last-month' | 'custom' | 'all';
  };
};

function formatTransactionDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR');
}

function normalizeValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function categoryEmoji(category?: CategoryDTO | null): string {
  const name = normalizeValue(category?.name ?? '');
  if (name.includes('merc')) return '🛒';
  if (name.includes('rest') || name.includes('aliment')) return '🍔';
  if (name.includes('morad') || name.includes('alug')) return '🏠';
  if (name.includes('transp') || name.includes('comb')) return '⛽';
  if (name.includes('internet')) return '🌐';
  if (name.includes('saud') || name.includes('farm')) return '💊';
  if (name.includes('lazer')) return '🎉';
  if (name.includes('renda') || name.includes('salario')) return '💼';
  return '✨';
}

function isDateInput(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferSupportedPeriodLabel(from?: string, to?: string, now = new Date()): (typeof PERIOD_LABELS)[number] {
  if (!from || !to) return 'Últimos 30 dias';

  const currentMonthStart = formatDateInput(startOfMonth(now));
  const currentMonthEnd = formatDateInput(endOfMonth(now));
  if (from === currentMonthStart && to === currentMonthEnd) {
    return 'Este mês';
  }

  const previousMonth = subMonths(now, 1);
  const previousMonthStart = formatDateInput(startOfMonth(previousMonth));
  const previousMonthEnd = formatDateInput(endOfMonth(previousMonth));
  if (from === previousMonthStart && to === previousMonthEnd) {
    return 'Mês passado';
  }

  const lastSevenDaysStart = formatDateInput(subDays(now, 7));
  const today = formatDateInput(now);
  if (from === lastSevenDaysStart && to === today) {
    return 'Últimos 7 dias';
  }

  const lastThirtyDaysStart = formatDateInput(subDays(now, 30));
  if (from === lastThirtyDaysStart && to === today) {
    return 'Últimos 30 dias';
  }

  const thisYearStart = formatDateInput(new Date(now.getFullYear(), 0, 1));
  const thisYearEnd = formatDateInput(new Date(now.getFullYear(), 11, 31));
  if (from === thisYearStart && to === thisYearEnd) {
    return 'Este ano';
  }

  return 'Últimos 30 dias';
}

function resolveTransactionsRouteState(searchParams: URLSearchParams, now = new Date()): TransactionsRouteState {
  const periodParam = searchParams.get('period');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let period: TransactionsPeriodSelection = {
    mode: '30d',
    label: 'Últimos 30 dias'
  };

  if (periodParam === '7d') {
    period = { mode: '7d', label: 'Últimos 7 dias' };
  } else if (periodParam === '30d') {
    period = { mode: '30d', label: 'Últimos 30 dias' };
  } else if (periodParam === 'this-month' || periodParam === 'current-month') {
    period = { mode: 'this-month', label: 'Este mês' };
  } else if (periodParam === 'last-month') {
    period = { mode: 'last-month', label: 'Mês passado' };
  } else if (periodParam === '90d') {
    period = { mode: '90d', label: 'Últimos 30 dias' };
  } else if (periodParam === 'all') {
    period = { mode: 'all', label: 'Últimos 30 dias' };
  } else if ((periodParam === 'custom' || isDateInput(from) || isDateInput(to)) && isDateInput(from) && isDateInput(to)) {
    period = {
      mode: 'custom',
      label: inferSupportedPeriodLabel(from, to, now),
      from,
      to
    };
  }

  const typeParam = searchParams.get('type');
  const typeLabel =
    typeParam === 'income'
      ? 'Apenas Receitas'
      : typeParam === 'expense'
        ? 'Apenas Despesas'
        : 'Todas as Transações';

  return {
    period,
    typeLabel,
    categoryId: searchParams.get('categoryId') ?? '',
    uncategorizedOnly: searchParams.get('category') === 'uncategorized',
    accountId: searchParams.get('accountId') ?? '',
    excludedOnly: searchParams.get('excluded') === 'true' || searchParams.get('excluded') === 'excluded',
    searchQuery: searchParams.get('q') ?? ''
  };
}
export { resolveTransactionsRouteState };

function buildTransactionsRequestParams(input: {
  period: TransactionsPeriodSelection;
  typeLabel: (typeof TYPE_LABELS)[number];
  categoryId: string;
  accountId: string;
  excludedOnly: boolean;
  searchQuery: string;
}): URLSearchParams {
  const params = new URLSearchParams();

  if (input.period.mode === 'custom' && input.period.from && input.period.to) {
    params.set('period', 'custom');
    params.set('from', input.period.from);
    params.set('to', input.period.to);
  } else if (input.period.mode === 'this-year') {
    params.set('period', 'custom');
    params.set('from', `${new Date().getFullYear()}-01-01`);
    params.set('to', `${new Date().getFullYear()}-12-31`);
  } else {
    params.set('period', input.period.mode);
  }

  if (input.typeLabel === 'Apenas Receitas') {
    params.set('type', 'income');
  } else if (input.typeLabel === 'Apenas Despesas') {
    params.set('type', 'expense');
  }

  if (input.categoryId) {
    params.set('categoryId', input.categoryId);
  }
  if (input.accountId) {
    params.set('accountId', input.accountId);
  }
  if (input.excludedOnly) {
    params.set('excluded', 'true');
  }

  const normalizedSearch = input.searchQuery.trim();
  if (normalizedSearch) {
    params.set('q', normalizedSearch);
  }

  params.set('pageSize', '200');
  params.set('includeMeta', 'true');
  params.set('sort', 'date_desc');

  return params;
}

export function resolveTransactionsRefreshMessage(input: TransactionsRefreshInput): string {
  if (!input.refreshing) return '';

  if (input.page > 1) {
    return 'Atualizando transações e paginação...';
  }

  if (
    input.debouncedQuery.trim().length > 0 ||
    input.filters.accountId ||
    input.filters.categoryId ||
    input.filters.type ||
    input.filters.period !== 'this-month'
  ) {
    return 'Aplicando filtros e recalculando indicadores...';
  }

  return 'Buscando transações e atualizando indicadores...';
}

function categoryChipStyle(category?: CategoryDTO | null): React.CSSProperties | undefined {
  if (!category?.color) return undefined;
  return {
    color: category.color,
    borderColor: `${category.color}40`,
    backgroundColor: `${category.color}1A`
  };
}

export function Transactions({ hideValues, onNewTransaction, onImport }: TransactionsProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0, cashBalance: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TransactionsPeriodSelection>({
    mode: '30d',
    label: 'Últimos 30 dias'
  });
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<(typeof TYPE_LABELS)[number]>('Todas as Transações');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [routeAccountId, setRouteAccountId] = useState('');
  const [routeExcludedOnly, setRouteExcludedOnly] = useState(false);
  const [routeUncategorizedOnly, setRouteUncategorizedOnly] = useState(false);
  const hasInitializedFromRoute = useRef(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
      setIsPeriodDropdownOpen(false);
      setIsTypeDropdownOpen(false);
      setIsCategoryDropdownOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const resolved = resolveTransactionsRouteState(new URLSearchParams(searchParams.toString()));

    setSelectedPeriod(resolved.period);
    setSelectedType(resolved.typeLabel);
    setSelectedCategoryFilter(resolved.categoryId);
    setSearchQuery(resolved.searchQuery);
    setRouteAccountId(resolved.accountId);
    setRouteExcludedOnly(resolved.excludedOnly);
    setRouteUncategorizedOnly(resolved.uncategorizedOnly);
    hasInitializedFromRoute.current = true;
  }, [searchParams]);

  const requestQuery = useMemo(() => {
    if (!hasInitializedFromRoute.current) return '';
    return buildTransactionsRequestParams({
      period: selectedPeriod,
      typeLabel: selectedType,
      categoryId: selectedCategoryFilter,
      accountId: routeAccountId,
      excludedOnly: routeExcludedOnly,
      searchQuery: deferredSearchQuery
    }).toString();
  }, [deferredSearchQuery, routeAccountId, routeExcludedOnly, selectedCategoryFilter, selectedPeriod, selectedType]);

  useEffect(() => {
    if (!hasInitializedFromRoute.current || !requestQuery) {
      return;
    }

    let active = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/transactions?${requestQuery}`, {
          cache: 'no-store'
        });
        const { data, errorMessage } = await parseApiResponse<TransactionsResponse | { error?: unknown }>(response);

        if (errorMessage) throw new Error(errorMessage);
        if (!response.ok || !data || !('items' in data)) {
          throw new Error(extractApiError(data, 'Não foi possível carregar transações.'));
        }

        if (!active) return;
        setTransactions(data.items);
        setCategories(data.meta?.categories ?? []);
        setSummary({
          income: data.summary?.income ?? 0,
          expense: data.summary?.expense ?? 0,
          balance: data.summary?.balance ?? 0,
          cashBalance: data.summary?.cashBalance ?? 0
        });
      } catch (loadError) {
        if (!active) return;
        setTransactions([]);
        setCategories([]);
        setSummary({ income: 0, expense: 0, balance: 0, cashBalance: 0 });
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar transações.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [requestQuery]);

  const visibleTransactions = useMemo(() => {
    if (!routeUncategorizedOnly) {
      return transactions;
    }

    return transactions.filter((transaction) => !transaction.categoryId);
  }, [routeUncategorizedOnly, transactions]);

  const visibleSummary = useMemo(() => {
    if (!routeUncategorizedOnly) {
      return summary;
    }

    return visibleTransactions.reduce(
      (accumulator, transaction) => {
        if (transaction.amount >= 0) {
          accumulator.income += Math.abs(transaction.amount);
        } else {
          accumulator.expense += Math.abs(transaction.amount);
        }
        accumulator.balance = accumulator.income - accumulator.expense;
        return accumulator;
      },
      { income: 0, expense: 0, balance: 0 }
    );
  }, [routeUncategorizedOnly, summary, visibleTransactions]);

  useEffect(() => {
    setSelectedIds((previous) => new Set([...previous].filter((id) => visibleTransactions.some((transaction) => transaction.id === id))));
  }, [visibleTransactions]);

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSelected = new Set(selectedIds);
    if (nextSelected.has(id)) {
      nextSelected.delete(id);
    } else {
      nextSelected.add(id);
    }
    setSelectedIds(nextSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === visibleTransactions.length && visibleTransactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTransactions.map((transaction) => transaction.id)));
    }
  };

  const deleteTransactions = async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeletingIds(ids);

    try {
      const response =
        ids.length === 1
          ? await fetch(`/api/transactions/${ids[0]}`, { method: 'DELETE' })
          : await fetch('/api/transactions', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
            });

      const { data, errorMessage } = await parseApiResponse<{ success?: boolean } | { error?: unknown }>(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok) {
        throw new Error(extractApiError(data, 'Não foi possível excluir transações.'));
      }

      setTransactions((previous) => previous.filter((transaction) => !ids.includes(transaction.id)));
      setSelectedIds((previous) => new Set([...previous].filter((id) => !ids.includes(id))));
      toast({
        variant: 'success',
        title: ids.length === 1 ? 'Transação excluída' : 'Transações excluídas',
        description: ids.length === 1 ? 'O lançamento foi removido.' : 'Os lançamentos selecionados foram removidos.'
      });
    } catch (deleteError) {
      toast({
        variant: 'error',
        title: 'Erro ao excluir',
        description: deleteError instanceof Error ? deleteError.message : 'Falha ao excluir transações.'
      });
    } finally {
      setDeletingIds([]);
    }
  };

  const categoryOptions = useMemo(
    () => categories.slice().sort((left, right) => left.name.localeCompare(right.name)),
    [categories]
  );
  const selectedCategoryLabel = useMemo(() => {
    if (!selectedCategoryFilter) return 'Categorias';
    return categories.find((category) => category.id === selectedCategoryFilter)?.name ?? 'Categorias';
  }, [categories, selectedCategoryFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Transações</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button onClick={onImport} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80">
            <UploadCloud size={16} className="text-muted-foreground" />
            Importar extrato
          </button>
          <button onClick={() => onNewTransaction()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary/90">
            <Plus size={16} />
            Nova Transação
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setIsPeriodDropdownOpen(!isPeriodDropdownOpen); setIsTypeDropdownOpen(false); setIsCategoryDropdownOpen(false); }} className={cn('flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors sm:w-auto', isPeriodDropdownOpen ? 'bg-secondary/80 border-border text-foreground' : 'bg-secondary/40 border-border hover:bg-secondary/80')}>
            {selectedPeriod.label} <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', isPeriodDropdownOpen && 'rotate-180')} />
          </button>
          {isPeriodDropdownOpen ? (
            <div className="absolute left-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col py-1">
                {PERIOD_LABELS.map((period) => (
                  <button
                    key={period}
                    className={cn('px-4 py-2 text-xs text-left transition-colors', selectedPeriod.label === period ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40')}
                    onClick={() => {
                      if (period === 'Últimos 7 dias') setSelectedPeriod({ mode: '7d', label: period });
                      if (period === 'Últimos 30 dias') setSelectedPeriod({ mode: '30d', label: period });
                      if (period === 'Este mês') setSelectedPeriod({ mode: 'this-month', label: period });
                      if (period === 'Mês passado') setSelectedPeriod({ mode: 'last-month', label: period });
                      if (period === 'Este ano') setSelectedPeriod({ mode: 'this-year', label: period });
                      setIsPeriodDropdownOpen(false);
                    }}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsPeriodDropdownOpen(false); setIsCategoryDropdownOpen(false); }} className={cn('flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors sm:w-auto', isTypeDropdownOpen || selectedType !== 'Todas as Transações' ? 'bg-secondary/80 border-border text-foreground' : 'bg-secondary/40 border-border hover:bg-secondary/80')}>
            {selectedType} <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', isTypeDropdownOpen && 'rotate-180')} />
          </button>
          {isTypeDropdownOpen ? (
            <div className="absolute left-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col py-1">
                {TYPE_LABELS.map((typeLabel) => (
                  <button key={typeLabel} className={cn('px-4 py-2 text-xs text-left transition-colors', selectedType === typeLabel ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40')} onClick={() => { setSelectedType(typeLabel); setIsTypeDropdownOpen(false); }}>
                    {typeLabel}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setIsCategoryDropdownOpen(!isCategoryDropdownOpen); setIsPeriodDropdownOpen(false); setIsTypeDropdownOpen(false); }} className={cn('flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors sm:w-auto', isCategoryDropdownOpen || selectedCategoryFilter ? 'bg-secondary/80 border-border text-foreground' : 'bg-secondary/40 border-border hover:bg-secondary/80')}>
            {selectedCategoryLabel} <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', isCategoryDropdownOpen && 'rotate-180')} />
          </button>
          {isCategoryDropdownOpen ? (
            <div className="absolute left-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col py-1 max-h-48 overflow-y-auto">
                <button className={cn('px-4 py-2 text-xs text-left transition-colors', !selectedCategoryFilter ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40')} onClick={() => { setSelectedCategoryFilter(''); setIsCategoryDropdownOpen(false); }}>
                  Todas as Categorias
                </button>
                {categoryOptions.map((category) => (
                  <button key={category.id} className={cn('px-4 py-2 text-xs text-left transition-colors', selectedCategoryFilter === category.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40')} onClick={() => { setSelectedCategoryFilter(category.id); setIsCategoryDropdownOpen(false); }}>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <button
          onClick={() => {
            setSelectedPeriod({ mode: '30d', label: 'Últimos 30 dias' });
            setSelectedType('Todas as Transações');
            setSelectedCategoryFilter('');
            setSearchQuery('');
            setRouteAccountId('');
            setRouteExcludedOnly(false);
            setRouteUncategorizedOnly(false);
          }}
          className={cn('self-start px-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:self-auto', (selectedPeriod.mode !== '30d' || selectedType !== 'Todas as Transações' || selectedCategoryFilter || searchQuery) ? 'opacity-100' : 'pointer-events-none opacity-0')}
        >
          Limpar filtros
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border/60 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar transações..." className="w-full bg-muted/30 border border-border/60 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-all duration-300 placeholder:text-muted-foreground" />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm font-medium lg:gap-6">
            <div className="flex items-center gap-2 text-muted-foreground"><ListFilter size={16} /><span>{visibleTransactions.length}</span></div>
            <div className="flex items-center gap-2 text-success"><ArrowDownRight size={16} /><span className="geist-mono">{formatCurrency(visibleSummary.income, hideValues)}</span></div>
            <div className="flex items-center gap-2 text-error"><ArrowUpRight size={16} /><span className="geist-mono">{formatCurrency(visibleSummary.expense, hideValues)}</span></div>
            <div className="flex items-center gap-2 text-success"><span className="text-muted-foreground mr-1">=</span><span className="geist-mono">{formatCurrency(visibleSummary.balance, hideValues)}</span></div>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 border-b border-primary/20 bg-primary/10 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-primary">{selectedIds.size} {selectedIds.size === 1 ? 'transação selecionada' : 'transações selecionadas'}</span>
            <button onClick={() => void deleteTransactions([...selectedIds])} disabled={deletingIds.length > 0} className="inline-flex items-center justify-center gap-2 rounded-md bg-error/10 px-3 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50">
              <Trash2 size={14} />
              Deletar selecionadas
            </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 p-4 md:hidden">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando transações...</div>
          ) : error ? (
            <div className="py-8 text-center text-error">{error}</div>
          ) : visibleTransactions.length === 0 ? (
            <div className="space-y-3 py-8 text-center text-muted-foreground">
              <p>Nenhuma transação encontrada.</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                <button onClick={() => onNewTransaction()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary/90">Adicionar transação</button>
                <button onClick={onImport} className="rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80">Importar extrato</button>
              </div>
            </div>
          ) : (
            visibleTransactions.map((transaction, index) => (
              <div
                key={transaction.id}
                className={cn('glass-card cursor-pointer rounded-2xl p-4 transition-colors', selectedIds.has(transaction.id) ? 'bg-primary/5' : 'hover:bg-muted/30')}
                onClick={(e) => toggleSelection(transaction.id, e)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {selectedIds.has(transaction.id) ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary fill-primary/20 scale-110 transition-all duration-200" /> : <Circle size={16} className="mt-0.5 shrink-0 text-muted-foreground transition-all duration-200" />}
                    <div className="min-w-0 space-y-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">{index + 1}.</span>
                        <span className="truncate font-medium text-foreground">{transaction.description}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-2.5 py-1 rounded-md border text-[10px] font-medium tracking-wide" style={categoryChipStyle(transaction.category)}>
                          {categoryEmoji(transaction.category)} {transaction.category?.name ?? 'Sem categoria'}
                        </span>
                        <span>{formatTransactionDate(transaction.date)}</span>
                        <span>{transaction.account.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className={cn('geist-mono text-right text-sm font-medium', transaction.amount >= 0 ? 'text-success' : 'text-foreground')}>
                      R$ {formatCurrency(Math.abs(transaction.amount), hideValues).replace('R$', '').trim()}
                    </div>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === transaction.id ? null : transaction.id); }} className={cn('rounded p-1 transition-colors', openMenuId === transaction.id ? 'bg-secondary/80 text-foreground' : 'hover:bg-secondary/80 hover:text-foreground')}>
                        <MoreHorizontal size={16} />
                      </button>
                      {openMenuId === transaction.id ? (
                        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-xl" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col py-1">
                            <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground" onClick={() => { onNewTransaction(transaction); setOpenMenuId(null); }}>
                              <Tag size={14} />
                              Editar categoria
                            </button>
                            <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-error transition-colors hover:bg-error/10" onClick={() => { void deleteTransactions([transaction.id]); setOpenMenuId(null); }}>
                              <Trash2 size={14} />
                              Excluir transação
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block md:overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest border-b border-border/60 bg-muted/10">
              <tr>
                <th className="px-6 py-4 w-10 cursor-pointer group" onClick={toggleAll}>
                  {selectedIds.size === visibleTransactions.length && visibleTransactions.length > 0 ? <CheckCircle2 size={16} className="text-primary fill-primary/20 scale-110 transition-all duration-200" /> : <Circle size={16} className="text-muted-foreground group-hover:text-foreground transition-all duration-200" />}
                </th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Data <ChevronDown size={12} className="inline ml-1" /></th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center w-16">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">Carregando transações...</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-error">{error}</td></tr>
              ) : visibleTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
                    <div className="space-y-3">
                      <p>Nenhuma transação encontrada.</p>
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => onNewTransaction()} className="bg-primary hover:bg-primary/90 text-background px-4 py-2 rounded-lg text-sm font-medium transition-colors">Adicionar transação</button>
                        <button onClick={onImport} className="bg-secondary/40 hover:bg-secondary/80 text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-border">Importar extrato</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleTransactions.map((transaction, index) => (
                  <tr key={transaction.id} onClick={(e) => toggleSelection(transaction.id, e)} className={cn('transition-colors group cursor-pointer', selectedIds.has(transaction.id) ? 'bg-primary/5' : 'hover:bg-muted/30')}>
                    <td className="px-6 py-4">
                      {selectedIds.has(transaction.id) ? <CheckCircle2 size={16} className="text-primary fill-primary/20 scale-110 transition-all duration-200" /> : <Circle size={16} className="text-muted-foreground group-hover:text-muted-foreground transition-all duration-200" />}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground group-hover:text-foreground transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground text-xs w-4 text-center">{index + 1}</span>
                        {transaction.description}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md border text-[10px] font-medium tracking-wide flex items-center gap-1.5 w-fit" style={categoryChipStyle(transaction.category)}>
                        <span>{categoryEmoji(transaction.category)}</span>
                        {transaction.category?.name ?? 'Sem categoria'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">{formatTransactionDate(transaction.date)}</td>
                    <td className={cn('px-6 py-4 text-right geist-mono font-medium', transaction.amount >= 0 ? 'text-success' : 'text-foreground')}>
                      R$ {formatCurrency(Math.abs(transaction.amount), hideValues).replace('R$', '').trim()}
                    </td>
                    <td className="px-6 py-4 text-center text-muted-foreground transition-colors relative">
                      <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === transaction.id ? null : transaction.id); }} className={cn('p-1 rounded transition-colors', openMenuId === transaction.id ? 'bg-secondary/80 text-foreground' : 'hover:bg-secondary/80 hover:text-foreground')}>
                        <MoreHorizontal size={16} />
                      </button>
                      {openMenuId === transaction.id ? (
                        <div className="absolute right-12 top-1/2 -translate-y-1/2 w-48 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col py-1">
                            <button className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors text-left w-full" onClick={() => { onNewTransaction(transaction); setOpenMenuId(null); }}>
                              <Tag size={14} />
                              Editar categoria
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 text-xs text-error hover:bg-error/10 transition-colors text-left w-full" onClick={() => { void deleteTransactions([transaction.id]); setOpenMenuId(null); }}>
                              <Trash2 size={14} />
                              Excluir transação
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

