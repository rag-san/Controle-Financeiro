import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronDown,
  Loader2,
  ArrowRight,
  Banknote,
  Calendar,
  Info,
  Landmark
} from 'lucide-react';
import { motion, AnimatePresence as MotionAnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import type { AccountDTO, CategoryDTO } from '@/lib/types';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import { cn, formatCurrency } from '@/src/app-shell/utils';

const AnimatePresence = MotionAnimatePresence as unknown as React.ComponentType<React.PropsWithChildren<{ mode?: 'wait' }>>;

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportStep = 'upload' | 'processing' | 'preview' | 'success';

interface PreviewTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: string | null;
  category: string;
  account: string;
  hasError?: boolean;
}

type ImportCommitRow = {
  date: string;
  description: string;
  amount: number;
  type?: 'income' | 'expense' | 'transfer';
  balanceAfter?: number | null;
  transactionKindRaw?: string;
  counterpartyRaw?: string;
  transactionKindNorm?: string;
  counterpartyNorm?: string;
  merchantKey?: string;
  sourceType?: 'csv' | 'ofx' | 'pdf' | 'manual';
  documentType?: string | null;
  accountId?: string;
  accountHint?: string;
  categoryId?: string | null;
  transferToAccountId?: string;
  transferFromAccountId?: string;
  externalId?: string;
  raw?: Record<string, unknown>;
};

type ParsePreviewRow = {
  commitIndex: number | null;
  status: 'ok' | 'ignored' | 'error';
  date: string | null;
  description: string;
  amount: number | null;
  type: 'income' | 'expense' | 'transfer' | null;
  accountHint?: string;
};

type ImportParseResponse = {
  sourceType: 'csv' | 'ofx' | 'pdf';
  accountHint?: string | null;
  rows: ImportCommitRow[];
  preview: ParsePreviewRow[];
  needsMapping: boolean;
};

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchCategoryByDescription(categories: CategoryDTO[], description: string): CategoryDTO | null {
  const normalizedDescription = normalizeName(description);
  return (
    categories.find((category) => {
      const normalizedCategory = normalizeName(category.name);
      return normalizedDescription.includes(normalizedCategory) || normalizedCategory.includes(normalizedDescription);
    }) ?? null
  );
}

function matchAccountByHint(accounts: AccountDTO[], hint?: string | null): AccountDTO | null {
  if (!hint) return null;
  const normalizedHint = normalizeName(hint);
  return (
    accounts.find((account) => {
      const normalizedAccount = normalizeName(account.name);
      const normalizedInstitution = normalizeName(account.institution ?? '');
      return (
        normalizedAccount.includes(normalizedHint) ||
        normalizedHint.includes(normalizedAccount) ||
        (normalizedInstitution && normalizedInstitution.includes(normalizedHint))
      );
    }) ?? null
  );
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<ImportStep>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewTransaction[]>([]);
  const [commitRows, setCommitRows] = useState<ImportCommitRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [selectedAccountMode, setSelectedAccountMode] = useState<'auto' | 'existing' | 'new'>('auto');
  const [selectedExistingAccount, setSelectedExistingAccount] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [parsedSourceType, setParsedSourceType] = useState<'csv' | 'ofx' | 'pdf'>('csv');

  const inputRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<number | null>(null);

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
        setAccounts(accountsData);
        setCategories(categoriesData);
      } catch (error) {
        if (!active) return;
        toast({
          variant: 'error',
          title: 'Erro ao carregar importação',
          description: error instanceof Error ? error.message : 'Falha ao carregar dados auxiliares.'
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
    setStep('upload');
    setDragActive(false);
    setFile(null);
    setPreviewData([]);
    setCommitRows([]);
    setProgress(0);
    setSelectedAccountMode('auto');
    setSelectedExistingAccount('');
    setNewAccountName('');
    setProcessing(false);
    setParsedSourceType('csv');
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  const startProgressAnimation = (): void => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
    }

    setProgress(4);
    progressTimerRef.current = window.setInterval(() => {
      setProgress((previous) => {
        if (previous >= 92) return previous;
        return previous + (previous < 40 ? 8 : previous < 70 ? 4 : 2);
      });
    }, 120);
  };

  const stopProgressAnimation = (finalProgress = 100): void => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgress(finalProgress);
  };

  const buildPreviewState = (
    rows: ImportCommitRow[],
    preview: ParsePreviewRow[],
    accountsList: AccountDTO[],
    categoriesList: CategoryDTO[]
  ): PreviewTransaction[] => {
    return rows.map((row, index) => {
      const previewRow = preview.find((item) => item.commitIndex === index);
      const suggestedCategory =
        categoriesList.find((category) => category.id === row.categoryId) ??
        matchCategoryByDescription(categoriesList, row.description);
      const account =
        accountsList.find((candidate) => candidate.id === row.accountId) ??
        matchAccountByHint(accountsList, row.accountHint ?? previewRow?.accountHint ?? null);

      return {
        id: String(index),
        date: row.date,
        description: row.description,
        amount: Math.abs(row.amount),
        type: row.amount >= 0 ? 'income' : 'expense',
        categoryId: row.categoryId ?? suggestedCategory?.id ?? null,
        category: row.categoryId
          ? categoriesList.find((category) => category.id === row.categoryId)?.name ?? ''
          : suggestedCategory?.name ?? '',
        account: account?.name ?? row.accountHint ?? '',
        hasError: previewRow?.status === 'error' || !(row.categoryId ?? suggestedCategory?.id)
      };
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      void handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setStep('processing');
    setProcessing(true);
    startProgressAnimation();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/imports/parse', {
        method: 'POST',
        body: formData
      });

      const { data, errorMessage } = await parseApiResponse<ImportParseResponse | { error?: unknown }>(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !data || !('rows' in data)) {
        throw new Error(extractApiError(data, 'Não foi possível analisar o arquivo.'));
      }
      if (data.needsMapping) {
        throw new Error('Não foi possível mapear automaticamente este arquivo. Tente um CSV/OFX/PDF compatível.');
      }

      const nextPreviewData = buildPreviewState(data.rows, data.preview, accounts, categories);
      const firstMatchedAccount = matchAccountByHint(accounts, data.accountHint ?? null);

      setParsedSourceType(data.sourceType);
      setCommitRows(data.rows);
      setPreviewData(nextPreviewData);
      setSelectedExistingAccount(firstMatchedAccount?.id ?? '');
      stopProgressAnimation();
      setStep('preview');
    } catch (error) {
      stopProgressAnimation(0);
      setStep('upload');
      setFile(null);
      setPreviewData([]);
      setCommitRows([]);
      toast({
        variant: 'error',
        title: 'Erro ao analisar arquivo',
        description: error instanceof Error ? error.message : 'Falha ao ler o arquivo.'
      });
    } finally {
      setProcessing(false);
    }
  };

  const removeTransaction = (id: string) => {
    const index = Number.parseInt(id, 10);
    if (!Number.isFinite(index)) return;

    setPreviewData((previous) =>
      previous
        .filter((item) => item.id !== id)
        .map((item, itemIndex) => ({ ...item, id: String(itemIndex) }))
    );
    setCommitRows((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
  };

  const updateCategory = (id: string, newCategoryId: string) => {
    const category = categories.find((item) => item.id === newCategoryId) ?? null;
    const index = Number.parseInt(id, 10);

    setPreviewData((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              categoryId: newCategoryId,
              category: category?.name ?? '',
              hasError: false
            }
          : item
      )
    );

    setCommitRows((previous) =>
      previous.map((row, rowIndex) => (rowIndex === index ? { ...row, categoryId: newCategoryId } : row))
    );
  };

  const totalAmount = useMemo(
    () =>
      previewData.reduce(
        (accumulator, current) => (current.type === 'income' ? accumulator + current.amount : accumulator - current.amount),
        0
      ),
    [previewData]
  );

  const totalTransactions = previewData.length;

  const resolveDefaultAccountId = async (): Promise<string | undefined> => {
    if (selectedAccountMode === 'existing') {
      return selectedExistingAccount || undefined;
    }

    if (selectedAccountMode === 'new') {
      const trimmedName = newAccountName.trim();
      if (!trimmedName) return undefined;

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          type: 'checking',
          institution: trimmedName,
          currency: 'BRL',
          parentAccountId: null
        })
      });

      const { data, errorMessage } = await parseApiResponse<AccountDTO | { error?: unknown }>(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !data || Array.isArray(data) || !('id' in data)) {
        throw new Error(extractApiError(data, 'Não foi possível criar a nova conta.'));
      }

      const createdAccount = data as AccountDTO;
      setAccounts((previous) => [...previous, createdAccount]);
      setSelectedExistingAccount(createdAccount.id);
      return createdAccount.id;
    }

    return selectedExistingAccount || undefined;
  };

  const handleImport = async () => {
    setStep('processing');
    setProcessing(true);
    startProgressAnimation();

    try {
      const defaultAccountId = await resolveDefaultAccountId();
      const response = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: parsedSourceType,
          fileName: file?.name ?? 'importacao',
          defaultAccountId,
          rows: commitRows
        })
      });

      const { data, errorMessage } = await parseApiResponse<
        { totalImported?: number; warnings?: string[] } | { error?: unknown }
      >(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok) {
        throw new Error(extractApiError(data, 'Não foi possível concluir a importação.'));
      }

      stopProgressAnimation();
      setStep('success');
      router.refresh();

      const warningMessage =
        data && 'warnings' in data && Array.isArray(data.warnings) && data.warnings[0]
          ? data.warnings[0]
          : undefined;

      toast({
        variant: 'success',
        title: 'Importação concluída',
        description:
          warningMessage ??
          `${data && 'totalImported' in data && typeof data.totalImported === 'number' ? data.totalImported : commitRows.length} transação(ões) importada(s).`
      });
    } catch (error) {
      stopProgressAnimation(0);
      setStep('preview');
      toast({
        variant: 'error',
        title: 'Erro ao importar transações',
        description: error instanceof Error ? error.message : 'Falha ao concluir a importação.'
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-start sm:pt-[5vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-overlay/60 backdrop-blur-sm"
          onClick={step !== 'processing' && !processing ? onClose : undefined}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative flex w-full max-h-[100dvh] flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-4xl sm:rounded-3xl sm:max-h-[90vh]"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 p-4 sm:items-center sm:p-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Importar Extrato</h2>
              <p className="text-sm text-muted-foreground mt-1">Adicione múltiplas transações de uma vez</p>
            </div>
            {step !== 'processing' && !processing ? (
              <button onClick={onClose} className="p-2 bg-secondary/40 hover:bg-secondary/80 rounded-full transition-colors text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <AnimatePresence mode="wait">
              {step === 'upload' ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center justify-center py-8 sm:py-12"
                >
                  <div
                    className={cn(
                      'relative flex w-full max-w-full flex-col items-center justify-center overflow-hidden rounded-[2rem] border-2 border-dashed p-8 text-center transition-all duration-300 cursor-pointer group sm:max-w-xl sm:p-12',
                      dragActive ? 'border-primary bg-primary/10 shadow-[0_0_40px_hsl(var(--primary) / 0.15)] scale-[1.02]' : 'border-border hover:border-border hover:bg-muted/30'
                    )}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                  >
                    <input ref={inputRef} type="file" className="hidden" accept=".csv,.ofx,.pdf" onChange={handleChange} />
                    <div
                      className={cn(
                        'mb-6 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500',
                        dragActive ? 'bg-primary/20 text-primary scale-110' : 'bg-secondary/40 text-muted-foreground group-hover:scale-110 group-hover:bg-secondary/80'
                      )}
                    >
                      <UploadCloud size={40} className={cn('transition-transform duration-500', dragActive && '-translate-y-1')} />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-foreground">Arraste seu extrato aqui</h3>
                    <p className="text-muted-foreground mb-8 max-w-xs mx-auto leading-relaxed">
                      ou clique para selecionar do seu computador. O sistema irá ler e categorizar automaticamente.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-muted-foreground/60">
                      <span className="px-3 py-1.5 rounded-lg bg-secondary/40 border border-border/60">CSV</span>
                      <span className="px-3 py-1.5 rounded-lg bg-secondary/40 border border-border/60">OFX</span>
                      <span className="px-3 py-1.5 rounded-lg bg-secondary/40 border border-border/60">PDF</span>
                    </div>
                  </div>
                </motion.div>
              ) : null}

              {step === 'processing' ? (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center justify-center py-16 sm:py-24"
                >
                  <div className="relative w-28 h-28 mb-8">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle className="text-foreground/5 stroke-current" strokeWidth="3" cx="50" cy="50" r="44" fill="transparent"></circle>
                      <circle
                        className="text-primary stroke-current transition-all duration-300 ease-out"
                        strokeWidth="3"
                        strokeLinecap="round"
                        cx="50"
                        cy="50"
                        r="44"
                        fill="transparent"
                        strokeDasharray="276.46"
                        strokeDashoffset={276.46 - (276.46 * progress) / 100}
                        transform="rotate(-90 50 50)"
                      ></circle>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText size={28} className="text-primary animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-3 text-foreground">Analisando extrato...</h3>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">Lendo transações e identificando padrões</p>
                    <div className="flex items-center gap-1 text-xs font-mono text-primary/80 bg-primary/10 px-3 py-1 rounded-full">
                      <Loader2 size={12} className="animate-spin" />
                      {progress}% concluído
                    </div>
                  </div>
                </motion.div>
              ) : null}

              {step === 'preview' ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col h-full"
                >
                  <div className="flex flex-col gap-6 mb-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center border border-primary/10 shadow-inner">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                            {file?.name || 'extrato.csv'}
                            <span className="px-2 py-0.5 rounded-md bg-secondary/80 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                              {parsedSourceType.toUpperCase()}
                            </span>
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1"><Banknote size={12}/> Importação</span>
                            <span className="w-1 h-1 rounded-full bg-secondary"></span>
                            <span className="flex items-center gap-1"><Calendar size={12}/> Preview pronto</span>
                            <span className="w-1 h-1 rounded-full bg-secondary"></span>
                            <span>{totalTransactions} transações</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                      <div className="flex flex-col justify-center rounded-2xl border border-border/60 bg-muted/30 p-4">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                          Entradas
                        </div>
                        <div className="text-success font-mono text-lg font-medium">
                          + R$ {formatCurrency(previewData.filter((item) => item.type === 'income').reduce((acc, item) => acc + item.amount, 0), false).replace('R$', '').trim()}
                        </div>
                      </div>
                      <div className="flex flex-col justify-center rounded-2xl border border-border/60 bg-muted/30 p-4">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-error"></div>
                          Saídas
                        </div>
                        <div className="text-error font-mono text-lg font-medium">
                          - R$ {formatCurrency(previewData.filter((item) => item.type === 'expense').reduce((acc, item) => acc + item.amount, 0), false).replace('R$', '').trim()}
                        </div>
                      </div>
                      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-4">
                        <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none"></div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          Saldo Líquido
                        </div>
                        <div className="font-mono text-lg font-medium text-foreground">R$ {formatCurrency(totalAmount, false).replace('R$', '').trim()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:p-5">
                    <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                      <Landmark size={16} className="text-primary" />
                      Onde estas transações devem ser salvas?
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button onClick={() => setSelectedAccountMode('auto')} className={cn('flex flex-col items-start p-3 rounded-xl border transition-all duration-200 text-left', selectedAccountMode === 'auto' ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80')}>
                        <span className="text-sm font-medium mb-1">Criar Automaticamente</span>
                        <span className="text-xs opacity-80">O sistema detecta pelo arquivo</span>
                      </button>
                      <button onClick={() => setSelectedAccountMode('existing')} className={cn('flex flex-col items-start p-3 rounded-xl border transition-all duration-200 text-left', selectedAccountMode === 'existing' ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80')}>
                        <span className="text-sm font-medium mb-1">Conta Existente</span>
                        <span className="text-xs opacity-80">Selecionar uma conta já criada</span>
                      </button>
                      <button onClick={() => setSelectedAccountMode('new')} className={cn('flex flex-col items-start p-3 rounded-xl border transition-all duration-200 text-left', selectedAccountMode === 'new' ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80')}>
                        <span className="text-sm font-medium mb-1">Criar Nova Conta</span>
                        <span className="text-xs opacity-80">Definir nome manualmente</span>
                      </button>
                    </div>

                    {selectedAccountMode === 'existing' ? (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200 relative">
                        <select value={selectedExistingAccount} onChange={(e) => setSelectedExistingAccount(e.target.value)} className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all appearance-none cursor-pointer">
                          <option value="" disabled>Selecione a conta...</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id} className="bg-popover">{account.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    ) : null}

                    {selectedAccountMode === 'new' ? (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <input type="text" placeholder="Nome da nova conta (Ex: Nubank Principal)" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all" />
                      </div>
                    ) : null}
                  </div>
 
                  <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-inner">
                    <div className="grid gap-3 p-4 md:hidden">
                      {previewData.map((tx) => (
                        <div key={tx.id} className={cn('rounded-2xl border border-border/60 bg-muted/10 p-4', tx.hasError ? 'bg-warning/[0.03]' : '')}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-2">
                              <div className="flex items-center gap-2">
                                {tx.hasError ? (
                                  <div className="relative group/tooltip">
                                    <AlertCircle size={16} className="text-warning" />
                                  </div>
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-secondary"></div>
                                )}
                                <span className={cn('font-medium', tx.hasError ? 'text-foreground' : 'text-muted-foreground')}>
                                  {tx.description}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="whitespace-nowrap">{new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                                <span className="px-2 py-1 rounded-md bg-secondary/40 border border-border/60">{tx.account || 'Automático'}</span>
                                <span className={cn('px-2 py-1 rounded-md border text-[10px] font-medium', tx.hasError ? 'border-warning/30 text-warning' : 'border-border text-muted-foreground')}>
                                  {tx.category || 'Selecione categoria'}
                                </span>
                              </div>
                            </div>
                            <div className="text-right font-mono text-sm font-medium">
                              <div className={tx.type === 'income' ? 'text-success' : 'text-foreground'}>
                                {tx.type === 'income' ? '+' : '-'} R$ {formatCurrency(tx.amount, false).replace('R$', '').trim()}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <select
                              value={tx.categoryId ?? ''}
                              onChange={(e) => updateCategory(tx.id, e.target.value)}
                              className={cn(
                                'w-full appearance-none rounded-xl border bg-transparent px-3 py-2 text-xs font-medium outline-none transition-all duration-200',
                                tx.hasError ? 'border-warning/30 text-warning hover:bg-warning/10 hover:border-warning/50' : 'border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground hover:border-border focus:border-primary focus:ring-1 focus:ring-primary'
                              )}
                            >
                              <option value="" disabled>Selecione...</option>
                              {categories.map((category) => (
                                <option key={category.id} value={category.id} className="bg-popover text-foreground">{category.name}</option>
                              ))}
                            </select>
                            <button onClick={() => removeTransaction(tx.id)} className="shrink-0 rounded-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-error/10 hover:text-error" title="Remover transação">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {previewData.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                          <Info size={32} className="mb-3 text-muted-foreground" />
                          <p>Nenhuma transação encontrada ou todas foram removidas.</p>
                        </div>
                      ) : null}
                    </div>
                    <div className="hidden md:block">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest border-b border-border bg-muted/40">
                        <tr>
                          <th className="px-5 py-4 font-semibold">Data</th>
                          <th className="px-5 py-4 font-semibold">Descrição</th>
                          <th className="px-5 py-4 font-semibold">Categoria</th>
                          <th className="px-5 py-4 font-semibold">Conta</th>
                          <th className="px-5 py-4 text-right font-semibold">Valor</th>
                          <th className="px-5 py-4 text-center w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {previewData.map((tx) => (
                          <tr key={tx.id} className={cn('group transition-all duration-200', tx.hasError ? 'bg-warning/[0.03] hover:bg-warning/[0.08]' : 'hover:bg-muted/30')}>
                            <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap font-medium">
                              {new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                {tx.hasError ? (
                                  <div className="relative group/tooltip">
                                    <AlertCircle size={16} className="text-warning" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-popover text-foreground text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 border border-border shadow-xl">
                                      Categoria não identificada
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover"></div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-secondary"></div>
                                )}
                                <span className={cn('font-medium', tx.hasError ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground transition-colors')}>
                                  {tx.description}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="relative">
                                <select
                                  value={tx.categoryId ?? ''}
                                  onChange={(e) => updateCategory(tx.id, e.target.value)}
                                  className={cn(
                                    'appearance-none bg-transparent border rounded-full px-3 py-1.5 text-xs font-medium outline-none cursor-pointer pr-8 transition-all duration-200',
                                    tx.hasError ? 'border-warning/30 text-warning hover:bg-warning/10 hover:border-warning/50' : 'border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground hover:border-border focus:border-primary focus:ring-1 focus:ring-primary'
                                  )}
                                >
                                  <option value="" disabled>Selecione...</option>
                                  {categories.map((category) => (
                                    <option key={category.id} value={category.id} className="bg-popover text-foreground">{category.name}</option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className={cn('absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors', tx.hasError ? 'text-warning/70' : 'text-muted-foreground group-hover:text-muted-foreground')} />
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground text-xs">
                              <span className="px-2 py-1 rounded-md bg-secondary/40 border border-border/60">{tx.account || 'Automático'}</span>
                            </td>
                            <td className={cn('px-5 py-3.5 text-right font-mono font-medium whitespace-nowrap', tx.type === 'income' ? 'text-success' : 'text-foreground')}>
                              {tx.type === 'income' ? '+' : '-'} R$ {formatCurrency(tx.amount, false).replace('R$', '').trim()}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <button onClick={() => removeTransaction(tx.id)} className="p-1.5 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100" title="Remover transação">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewData.length === 0 ? (
                      <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                        <Info size={32} className="mb-3 text-muted-foreground" />
                        <p>Nenhuma transação encontrada ou todas foram removidas.</p>
                      </div>
                    ) : null}
                    </div>
                  </div>
                </motion.div>
              ) : null}

              {step === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-success/20 rounded-full animate-ping opacity-50"></div>
                    <div className="w-24 h-24 rounded-full bg-success/20 text-success flex items-center justify-center relative z-10 border border-success/30 shadow-[0_0_40px_hsl(var(--success) / 0.2)]">
                      <CheckCircle2 size={48} />
                    </div>
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-foreground sm:text-3xl">Importação Concluída!</h3>
                  <p className="mb-10 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Foram importadas <strong className="text-foreground font-bold">{totalTransactions}</strong> transações com sucesso para a sua conta.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button onClick={() => setStep('upload')} className="rounded-xl border border-border px-8 py-3.5 text-sm font-bold text-muted-foreground transition-all duration-200 hover:bg-secondary/40 hover:text-foreground">
                      Importar outro
                    </button>
                    <button onClick={onClose} className="rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-background transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary) / 0.3)] hover:shadow-[0_0_30px_hsl(var(--primary) / 0.4)]">
                      Ver transações
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {step === 'preview' ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="shrink-0 border-t border-border/60 bg-overlay/40 p-4 backdrop-blur-xl sm:p-6"
              >
                <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <div>
                  {previewData.some((item) => item.hasError) ? (
                    <span className="flex items-center gap-2 text-warning">
                      <AlertCircle size={16} />
                      Corrija os erros antes de importar
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-success">
                      <CheckCircle2 size={16} />
                      Tudo pronto para importar
                    </span>
                  )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => setStep('upload')} className="rounded-xl border border-border/60 px-6 py-3 text-sm font-bold text-muted-foreground transition-all duration-200 hover:bg-muted/50 hover:text-foreground">
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handleImport()}
                    disabled={
                      previewData.length === 0 ||
                      previewData.some((item) => item.hasError) ||
                      loadingMeta ||
                      (selectedAccountMode === 'existing' && !selectedExistingAccount) ||
                      (selectedAccountMode === 'new' && !newAccountName.trim())
                    }
                    className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold text-background transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary) / 0.2)] hover:shadow-[0_0_30px_hsl(var(--primary) / 0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    Importar {previewData.length} transações
                    <ArrowRight size={16} />
                  </button>
                </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

