import React, { useEffect, useState } from 'react';
import { X, Landmark, CreditCard, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AccountDTO } from '@/lib/types';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import { cn } from '@/src/app-shell/utils';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (account: AccountDTO) => void;
}

function parseMoneyInput(value: string): number {
  if (!value.trim()) return 0;
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

export function NewAccountModal({ isOpen, onClose, onCreated }: NewAccountModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [accountType, setAccountType] = useState<'checking' | 'credit' | 'investment'>('checking');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAccountType('checking');
    setBankName('');
    setAccountName('');
    setInitialBalance('');
    setSaving(false);
  }, [isOpen]);

  const handleSave = async (): Promise<void> => {
    if (saving || accountName.trim().length < 2) return;

    setSaving(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: accountName.trim(),
          type: accountType,
          institution: bankName.trim() || null,
          currency: 'BRL',
          parentAccountId: null
        })
      });

      const { data, errorMessage } = await parseApiResponse<AccountDTO | { error?: unknown }>(response);
      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !data || Array.isArray(data) || !('id' in data)) {
        throw new Error(extractApiError(data, 'Não foi possível criar a conta.'));
      }

      const createdAccount = data as AccountDTO;
      const openingBalance = parseMoneyInput(initialBalance);
      if (openingBalance > 0 && accountType !== 'credit') {
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: createdAccount.id,
            categoryId: null,
            date: new Date().toISOString().slice(0, 10),
            description: 'Saldo inicial',
            amount: openingBalance,
            type: 'income',
            excluded: true,
            status: 'posted'
          })
        });
      }

      toast({
        variant: 'success',
        title: 'Conta criada',
        description: `${createdAccount.name} foi adicionada com sucesso.`
      });
      onCreated?.(createdAccount);
      onClose();
      router.refresh();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Erro ao criar conta',
        description: error instanceof Error ? error.message : 'Falha ao criar conta.'
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-overlay/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" onClick={saving ? undefined : onClose} />

      <div className="relative flex w-full max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:max-w-md sm:rounded-2xl sm:max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">Nova Conta</h2>
          <button onClick={onClose} disabled={saving} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-full transition-colors disabled:cursor-not-allowed">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button onClick={() => setAccountType('checking')} className={cn('flex flex-col items-center gap-2 rounded-xl border p-3 transition-all duration-200', accountType === 'checking' ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground')}>
              <Landmark size={24} />
              <span className="text-xs font-medium">Corrente</span>
            </button>
            <button onClick={() => setAccountType('credit')} className={cn('flex flex-col items-center gap-2 rounded-xl border p-3 transition-all duration-200', accountType === 'credit' ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground')}>
              <CreditCard size={24} />
              <span className="text-xs font-medium">Crédito</span>
            </button>
            <button onClick={() => setAccountType('investment')} className={cn('flex flex-col items-center gap-2 rounded-xl border p-3 transition-all duration-200', accountType === 'investment' ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground')}>
              <Wallet size={24} />
              <span className="text-xs font-medium">Investimentos</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Instituição Financeira</label>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Ex: Nubank, Itaú, Inter..." className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nome da Conta</label>
              <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Ex: Conta Principal" className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Saldo Inicial</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">R$</span>
                <input type="text" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0,00" className="w-full bg-secondary/40 border border-border rounded-xl pl-12 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono text-lg" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-muted/30 p-4 sm:flex-row sm:p-6">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl bg-secondary/40 px-4 py-3 font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => void handleSave()} disabled={saving || accountName.trim().length < 2} className="flex-1 rounded-xl bg-primary px-4 py-3 font-medium text-background transition-all duration-200 hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98] shadow-[0_0_15px_hsl(var(--primary) / 0.2)] hover:shadow-[0_0_25px_hsl(var(--primary) / 0.4)] disabled:opacity-50 disabled:hover:scale-100">
            Criar Conta
          </button>
        </div>
      </div>
    </div>
  );
}

