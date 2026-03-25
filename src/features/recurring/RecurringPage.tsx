import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, RefreshCw, Cloud, Music, MonitorPlay, HardDrive } from 'lucide-react';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import type { RecurringBootstrapResponse, RecurringFlowTab, RecurringItem } from '@/src/features/recurring/types';
import {
  calculateRecurringTotals,
  groupRecurringItemsByDueDate,
  parseRecurringItems
} from '@/src/features/recurring/utils/recurringTotals';
import { EmptyState } from '@/src/app-shell/components/EmptyState';
import { NewRecurringModal } from './components/NewRecurringModal';
import { Skeleton } from '@/src/app-shell/components/ShellSkeleton';
import { formatCurrency, cn } from '@/src/app-shell/utils';

interface RecurringProps {
  hideValues: boolean;
}

export { Recurring as RecurringPage };

function resolveVisual(item: RecurringItem) {
  const label = `${item.name} ${item.category?.name ?? ''}`.toLowerCase();

  if (label.includes('spotify') || label.includes('music')) {
    return { icon: Music, color: 'text-success', bg: 'bg-success/10' };
  }
  if (label.includes('netflix') || label.includes('disney') || label.includes('video')) {
    return { icon: MonitorPlay, color: 'text-error', bg: 'bg-error/10' };
  }
  if (label.includes('icloud') || label.includes('cloud')) {
    return { icon: Cloud, color: 'text-info', bg: 'bg-info/10' };
  }

  return { icon: HardDrive, color: item.amount >= 0 ? 'text-info' : 'text-success', bg: item.amount >= 0 ? 'bg-info/10' : 'bg-success/10' };
}

function formatGroupLabel(date: Date): string {
  return format(date, 'EEE, MMM d', { locale: ptBR })
    .replace(/\./g, '')
    .toUpperCase();
}

function isPaidThisMonth(item: RecurringItem, referenceDate: Date): boolean {
  return item.lastPaidAt ? isSameMonth(item.lastPaidAt, referenceDate) : false;
}

export function Recurring({ hideValues }: RecurringProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'despesas' | 'receitas'>('despesas');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const referenceDate = useMemo(() => new Date(), []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/recurring/bootstrap', { cache: 'no-store' });
      const { data, errorMessage } = await parseApiResponse<RecurringBootstrapResponse | { error?: unknown }>(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !data || !('items' in data)) {
        throw new Error(extractApiError(data, 'Não foi possível carregar os recorrentes.'));
      }

      setItems(parseRecurringItems(data.items));
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar recorrentes.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recurringFlow: RecurringFlowTab = activeTab === 'despesas' ? 'expenses' : 'income';
  const totals = useMemo(() => calculateRecurringTotals(items, recurringFlow, referenceDate), [items, recurringFlow, referenceDate]);
  const groupedItems = useMemo(() => groupRecurringItemsByDueDate(items, recurringFlow, referenceDate), [items, recurringFlow, referenceDate]);
  const circumference = 251.2;
  const dashOffset = circumference * (1 - totals.progress);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void load();
  };

  const handleTogglePaid = async (item: RecurringItem): Promise<void> => {
    setBusyId(item.id);

    try {
      const paid = isPaidThisMonth(item, referenceDate);
      const response = await fetch(`/api/recurring/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastPaidAt: paid ? null : new Date().toISOString()
        })
      });

      const { data, errorMessage } = await parseApiResponse<RecurringItem | { error?: unknown }>(response);
      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok) {
        throw new Error(extractApiError(data, 'Não foi possível atualizar o item recorrente.'));
      }

      setItems((previous) =>
        previous.map((current) =>
          current.id === item.id
            ? {
                ...current,
                lastPaidAt: paid ? null : new Date()
              }
            : current
        )
      );

      toast({
        variant: 'success',
        title: paid ? 'Pagamento removido' : 'Pagamento registrado',
        description: `${item.name} foi atualizado.`
      });
    } catch (updateError) {
      toast({
        variant: 'error',
        title: 'Erro ao atualizar recorrente',
        description: updateError instanceof Error ? updateError.message : 'Falha ao atualizar item.'
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500">
      <header className="mb-6 flex items-center gap-3 sm:mb-8">
        <button
          onClick={handleRefresh}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
          title="Atualizar"
          disabled={loading}
        >
          <RefreshCw size={20} className={cn((isRefreshing || loading) && 'animate-spin text-primary')} />
        </button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Recorrentes</h1>
      </header>

      <div className="flex flex-col gap-4 border-b border-border pb-0 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4 sm:gap-8">
          <button
            onClick={() => setActiveTab('despesas')}
            className={cn(
              'flex items-center gap-2 border-b-2 pb-3 transition-colors font-medium text-sm sm:pb-4',
              activeTab === 'despesas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn('w-2 h-2 rounded-sm', activeTab === 'despesas' ? 'bg-primary' : 'bg-muted')} />
            Despesas
          </button>
          <button
            onClick={() => setActiveTab('receitas')}
            className={cn(
              'flex items-center gap-2 border-b-2 pb-3 transition-colors font-medium text-sm sm:pb-4',
              activeTab === 'receitas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn('w-2 h-2 rounded-sm', activeTab === 'receitas' ? 'bg-primary' : 'bg-muted')} />
            Receitas
          </button>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="mb-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background transition-all duration-200 hover:scale-105 hover:bg-primary/90 active:scale-95 shadow-[0_0_15px_hsl(var(--accent) / 0.18)] hover:shadow-[0_0_25px_hsl(var(--accent) / 0.3)] sm:mb-3"
        >
          <Plus size={16} />
          Criar Novo
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="glass-card h-[144px]" />
          <Skeleton className="glass-card h-[340px]" />
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
          <div className="glass-card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div className="text-left">
              <div className="text-2xl font-semibold sm:text-3xl mb-1">
                R$ {formatCurrency(totals.remaining, hideValues).replace('R$', '').trim()}
              </div>
              <div className="text-muted-foreground text-sm">Falta pagar este mês</div>
            </div>

            <div className="relative flex h-20 w-20 items-center justify-center self-center sm:self-auto">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-muted-foreground"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="text-primary transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--accent) / 0.65)]" />
            </div>

            <div className="text-left sm:text-right">
              <div className="mb-1 text-2xl font-semibold sm:text-3xl">
                R$ {formatCurrency(totals.paid, hideValues).replace('R$', '').trim()}
              </div>
              <div className="text-muted-foreground text-sm">Pago até agora</div>
            </div>
          </div>

          <div className="glass-card p-6 sm:p-8">
            <div className="mb-6 text-xs font-bold uppercase tracking-widest text-muted-foreground sm:mb-8">Este Mês</div>

            {groupedItems.length === 0 ? (
              <EmptyState
                icon={HardDrive}
                title="Nenhum item recorrente"
                description="Crie despesas ou receitas recorrentes para acompanhar os pagamentos do mês."
                actionLabel="Criar recorrência"
                onAction={() => setIsModalOpen(true)}
              />
            ) : (
                  <div className="space-y-0">
                {groupedItems.map((group, index) => (
                  <div
                    key={group.dueDay}
                    className={cn(
                      'py-4',
                      index !== 0 && 'border-t border-border/60'
                    )}
                  >
                    <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {formatGroupLabel(group.date)}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const visual = resolveVisual(item);
                        const Icon = visual.icon;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => void handleTogglePaid(item)}
                            disabled={busyId === item.id}
                            className="group flex w-full items-start justify-between gap-3 rounded-lg p-3 -mx-2 transition-colors hover:bg-muted/30 disabled:opacity-60 sm:items-center"
                          >
                            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', visual.bg, visual.color)}>
                                <Icon size={16} />
                              </div>
                              <span className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-foreground">
                                {item.name}
                              </span>
                            </div>
                            <div className="shrink-0 text-sm font-medium">
                              R$ {formatCurrency(Math.abs(item.amount), hideValues).replace('R$', '').trim()}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <NewRecurringModal
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

