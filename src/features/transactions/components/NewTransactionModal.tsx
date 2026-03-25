import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowUpRight, ArrowDownRight, Calendar as CalendarIcon, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence as MotionAnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import type { AccountDTO, CategoryDTO, TransactionDTO } from '@/lib/types';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import { cn } from '@/src/app-shell/utils';

const AnimatePresence = MotionAnimatePresence as unknown as React.ComponentType<React.PropsWithChildren>;

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: TransactionDTO | null;
}

const QUICK_CATEGORY_ICONS: Record<string, string> = {
  alimentacao: '🍔',
  restaurante: '🍔',
  restaurantes: '🍔',
  transporte: '🚗',
  combustivel: '⛽',
  mercado: '🛒',
  supermercado: '🛒',
  saude: '💊',
  farmacia: '💊',
  lazer: '🎉',
  educacao: '📚',
  moradia: '🏠',
  internet: '🌐',
  salario: '💼',
  renda: '💼'
};

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatMoneyInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const parsed = Number.parseInt(digits, 10) / 100;
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseMoneyInput(value: string): number {
  if (!value) return 0;
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function resolveTransactionType(transaction?: TransactionDTO | null): 'income' | 'expense' {
  if (!transaction) return 'expense';
  return transaction.amount >= 0 ? 'income' : 'expense';
}

function resolveCategoryIcon(category?: CategoryDTO | null): string {
  if (!category?.name) return '✨';
  const normalized = normalizeLabel(category.name);
  const direct = QUICK_CATEGORY_ICONS[normalized];
  if (direct) return direct;

  const partial = Object.entries(QUICK_CATEGORY_ICONS).find(([key]) => normalized.includes(key));
  return partial?.[1] ?? '✨';
}

export function NewTransactionModal({ isOpen, onClose, transaction = null }: NewTransactionModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(transaction?.id);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const loadMeta = async (): Promise<void> => {
      setLoadingMeta(true);
      try {
        const [accountsResponse, categoriesResponse] = await Promise.all([
          fetch('/api/accounts', { cache: 'no-store' }),
          fetch('/api/categories', { cache: 'no-store' })
        ]);

        const { data: accountsData, errorMessage: accountsError } = await parseApiResponse<
          AccountDTO[] | { error?: unknown }
        >(accountsResponse);
        const { data: categoriesData, errorMessage: categoriesError } = await parseApiResponse<
          CategoryDTO[] | { error?: unknown }
        >(categoriesResponse);

        if (accountsError) throw new Error(accountsError);
        if (categoriesError) throw new Error(categoriesError);
        if (!accountsResponse.ok || !accountsData || !Array.isArray(accountsData)) {
          throw new Error(extractApiError(accountsData, 'Não foi possível carregar as contas.'));
        }
        if (!categoriesResponse.ok || !categoriesData || !Array.isArray(categoriesData)) {
          throw new Error(extractApiError(categoriesData, 'Não foi possível carregar as categorias.'));
        }

        if (!active) return;
        setAccounts(accountsData.filter((account) => account.type !== 'credit'));
        setCategories(categoriesData);
      } catch (error) {
        if (!active) return;
        toast({
          variant: 'error',
          title: 'Erro ao carregar formulário',
          description: error instanceof Error ? error.message : 'Falha ao carregar dados do formulário.'
        });
      } finally {
        if (active) {
          setLoadingMeta(false);
        }
      }
    };

    void loadMeta();

    return () => {
      active = false;
    };
  }, [isOpen, toast]);

  useEffect(() => {
    if (!isOpen) return;

    const fallbackAccountId =
      transaction?.accountId ?? accounts.find((account) => account.type !== 'credit')?.id ?? '';

    setType(resolveTransactionType(transaction));
    setAmount(
      transaction
        ? Math.abs(transaction.amount).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        : ''
    );
    setDescription(transaction?.description ?? '');
    setSelectedCategory(transaction?.categoryId ?? '');
    setSelectedAccount(fallbackAccountId);
    setDate(transaction?.date?.slice(0, 10) ?? new Date().toISOString().split('T')[0]);

    const timer = window.setTimeout(() => amountRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [accounts, isOpen, transaction]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const selectedCategoryIcon = selectedCategory ? resolveCategoryIcon(categoriesById.get(selectedCategory) ?? null) : null;
  const selectedAccountLabel = accounts.find((account) => account.id === selectedAccount)?.name ?? '';
  const isExpense = type === 'expense';
  const themeColor = isExpense ? 'text-error' : 'text-success';
  const isValid =
    amount !== '' &&
    amount !== '0,00' &&
    description.trim() !== '' &&
    selectedCategory !== '' &&
    selectedAccount !== '' &&
    !loadingMeta &&
    !saving;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(formatMoneyInput(e.target.value));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDescription(value);

    const normalizedDescription = normalizeLabel(value);
    const suggestedCategory = categories.find((category) => {
      const normalizedName = normalizeLabel(category.name);
      return (
        normalizedDescription.includes(normalizedName) ||
        normalizedName.includes(normalizedDescription)
      );
    });

    if (suggestedCategory && !selectedCategory) {
      setSelectedCategory(suggestedCategory.id);
    }

    if (normalizedDescription.includes('salario')) {
      setType('income');
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!isValid || saving) return;

    setSaving(true);
    try {
      const payload = {
        accountId: selectedAccount,
        categoryId: selectedCategory || null,
        date,
        description: description.trim(),
        amount: parseMoneyInput(amount),
        type,
        status: 'posted' as const
      };

      const response = await fetch(
        isEditing ? `/api/transactions/${transaction?.id}` : '/api/transactions',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      const { data, errorMessage } = await parseApiResponse<TransactionDTO | { error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }
      if (!response.ok) {
        throw new Error(
          extractApiError(
            data,
            isEditing ? 'Não foi possível atualizar a transação.' : 'Não foi possível salvar a transação.'
          )
        );
      }

      toast({
        variant: 'success',
        title: isEditing ? 'Transação atualizada' : 'Transação criada',
        description: isEditing ? 'As alterações foram salvas com sucesso.' : 'O lançamento foi salvo com sucesso.'
      });

      onClose();
      router.refresh();
    } catch (error) {
      toast({
        variant: 'error',
        title: isEditing ? 'Erro ao atualizar transação' : 'Erro ao criar transação',
        description: error instanceof Error ? error.message : 'Falha ao salvar a transação.'
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-start sm:pt-[8vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-overlay/80 backdrop-blur-md"
          onClick={saving ? undefined : onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'relative flex w-full max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl transition-colors duration-500 sm:max-w-md sm:rounded-3xl sm:max-h-[90vh]',
            isExpense ? 'border-error/20 shadow-[0_20px_60px_-15px_hsl(var(--error) / 0.15)]' : 'border-success/20 shadow-[0_20px_60px_-15px_hsl(var(--success) / 0.15)]'
          )}
        >
          <div
            className={cn(
              'absolute top-0 left-0 w-full h-64 bg-gradient-to-b opacity-20 pointer-events-none transition-colors duration-500',
              isExpense ? 'from-error/30 to-transparent' : 'from-success/30 to-transparent'
            )}
          />

          <div className="relative z-10 flex items-center justify-between gap-3 p-4 pb-2 sm:p-5 sm:pb-2">
            <div className="relative flex w-full bg-muted/40 p-1 rounded-2xl border border-border/60 backdrop-blur-md">
              <div
                className={cn(
                  'absolute inset-y-1 w-[calc(50%-4px)] rounded-xl transition-all duration-500 ease-out shadow-lg',
                  isExpense ? 'left-1 bg-error/15 border border-error/20' : 'left-[calc(50%+3px)] bg-success/15 border border-success/20'
                )}
              />
              <button
                onClick={() => setType('expense')}
                className={cn(
                  'relative z-10 flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors duration-300 sm:px-6',
                  isExpense ? 'text-error' : 'text-muted-foreground hover:text-muted-foreground'
                )}
              >
                <ArrowDownRight size={16} className={cn('transition-transform duration-300', isExpense && 'translate-y-0.5')} />
                Despesa
              </button>
              <button
                onClick={() => setType('income')}
                className={cn(
                  'relative z-10 flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors duration-300 sm:px-6',
                  !isExpense ? 'text-success' : 'text-muted-foreground hover:text-muted-foreground'
                )}
              >
                <ArrowUpRight size={16} className={cn('transition-transform duration-300', !isExpense && '-translate-y-0.5')} />
                Receita
              </button>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="shrink-0 rounded-full bg-secondary/40 p-2.5 text-muted-foreground transition-all duration-200 hover:scale-105 hover:bg-secondary/80 hover:text-foreground active:scale-95 disabled:cursor-not-allowed"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative z-10 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="flex items-baseline justify-center gap-2 w-full group">
                <span
                  className={cn(
                    'mb-1 text-xl font-medium transition-colors duration-300 sm:mb-2 sm:text-3xl',
                    amount ? themeColor : 'text-muted-foreground'
                  )}
                >
                  R$
                </span>
                <motion.input
                  ref={amountRef}
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0,00"
                  className={cn(
                    'w-full max-w-full border-none bg-transparent text-center font-mono text-4xl font-semibold leading-none tracking-tighter outline-none transition-all duration-300 placeholder:text-muted-foreground sm:max-w-[320px] sm:text-6xl',
                    amount ? 'text-foreground' : 'text-muted-foreground',
                    isExpense ? 'caret-error' : 'caret-success'
                  )}
                  autoComplete="off"
                  aria-busy={saving}
                  animate={{ scale: amount ? [1, 1.02, 1] : 1 }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Descrição</label>
              <div className="relative group">
                <input
                  type="text"
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Ex: Mercado, Uber, Salário..."
                  className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 pr-12 text-sm sm:text-base outline-none focus:border-border focus:bg-muted/60 transition-all duration-300 text-foreground placeholder:text-muted-foreground shadow-inner"
                  autoComplete="off"
                />
                <AnimatePresence>
                  {selectedCategoryIcon && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xl pointer-events-none"
                    >
                      {selectedCategoryIcon}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div
                  className={cn(
                    'absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 opacity-0 group-focus-within:opacity-100',
                    isExpense ? 'shadow-[0_0_0_1px_hsl(var(--error) / 0.4)]' : 'shadow-[0_0_0_1px_hsl(var(--success) / 0.4)]'
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Categoria</label>
              <div className="relative group">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={cn(
                    'w-full appearance-none bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-border transition-all duration-300 cursor-pointer hover:bg-muted/70',
                    selectedCategory === '' ? 'text-muted-foreground' : 'text-foreground'
                  )}
                  disabled={loadingMeta}
                >
                  <option value="" disabled className="bg-popover text-muted-foreground">Selecione uma categoria...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id} className="bg-popover text-foreground">
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                  {selectedCategoryIcon && <span className="text-base">{selectedCategoryIcon}</span>}
                  <ChevronDown size={14} className="text-muted-foreground transition-colors group-hover:text-muted-foreground" />
                </div>
                <div
                  className={cn(
                    'absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 opacity-0 group-focus-within:opacity-100',
                    isExpense ? 'shadow-[0_0_0_1px_hsl(var(--error) / 0.4)]' : 'shadow-[0_0_0_1px_hsl(var(--success) / 0.4)]'
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Conta Bancária</label>
                <div className="relative group">
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full appearance-none bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-border transition-all duration-300 text-foreground cursor-pointer hover:bg-muted/70"
                    disabled={loadingMeta}
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id} className="bg-popover text-foreground">
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                    {selectedAccountLabel ? <span className="text-base">🏦</span> : null}
                    <ChevronDown size={14} className="text-muted-foreground transition-colors group-hover:text-muted-foreground" />
                  </div>
                  <div
                    className={cn(
                      'absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 opacity-0 group-focus-within:opacity-100',
                      isExpense ? 'shadow-[0_0_0_1px_hsl(var(--error) / 0.4)]' : 'shadow-[0_0_0_1px_hsl(var(--success) / 0.4)]'
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Data</label>
                <div className="relative group">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-muted/40 border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-border transition-all duration-300 text-foreground cursor-pointer hover:bg-muted/70 [color-scheme:dark]"
                  />
                  <CalendarIcon size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none transition-colors group-hover:text-muted-foreground" />
                  <div
                    className={cn(
                      'absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 opacity-0 group-focus-within:opacity-100',
                      isExpense ? 'shadow-[0_0_0_1px_hsl(var(--error) / 0.4)]' : 'shadow-[0_0_0_1px_hsl(var(--success) / 0.4)]'
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-border/60 p-4 pt-0 sm:p-5 sm:pt-0">
            <button
              onClick={() => void handleSubmit()}
              disabled={!isValid}
              aria-busy={saving}
              className={cn(
                'w-full py-3.5 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden group',
                isValid
                  ? isExpense
                    ? 'bg-error text-foreground shadow-[0_8px_20px_-8px_hsl(var(--error) / 0.6)] hover:shadow-[0_8px_25px_-5px_hsl(var(--error) / 0.8)] hover:-translate-y-0.5 active:translate-y-0'
                    : 'bg-success text-foreground shadow-[0_8px_20px_-8px_hsl(var(--success) / 0.6)] hover:shadow-[0_8px_25px_-5px_hsl(var(--success) / 0.8)] hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-muted/40 text-muted-foreground cursor-not-allowed border border-border/60'
              )}
            >
              {isValid && (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              )}
              <Check size={20} className={cn('transition-transform duration-300', isValid && 'group-hover:scale-110')} />
              Salvar Transação
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

