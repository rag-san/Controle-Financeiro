import React, { useState, useEffect } from 'react';
import { X, Check, Repeat, Calendar } from 'lucide-react';
import { motion, AnimatePresence as MotionAnimatePresence } from 'motion/react';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import { cn } from '@/src/app-shell/utils';

const AnimatePresence = MotionAnimatePresence as unknown as React.ComponentType<React.PropsWithChildren>;

interface NewRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

function parseMoneyInput(value: string): number {
  if (!value.trim()) return 0;
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

export function NewRecurringModal({ isOpen, onClose, onCreated }: NewRecurringModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [frequency, setFrequency] = useState('monthly');
  const [dueDate, setDueDate] = useState('5');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAmount('');
      setType('expense');
      setFrequency('monthly');
      setDueDate('5');
      setSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = name.trim() !== '' && amount.trim() !== '' && !saving;

  const handleSave = async (): Promise<void> => {
    if (!isValid) return;

    setSaving(true);
    try {
      const numericAmount = parseMoneyInput(amount);
      const signedAmount = type === 'expense' ? Math.abs(numericAmount) : -Math.abs(numericAmount);
      const response = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          amount: signedAmount,
          dueDay: Number(dueDate) || 1,
          categoryId: null,
          status: 'active',
          lastPaidAt: null
        })
      });

      const { data, errorMessage } = await parseApiResponse<{ id?: string } | { error?: unknown }>(response);
      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok) {
        throw new Error(extractApiError(data, 'Não foi possível criar o recorrente.'));
      }

      toast({
        variant: 'success',
        title: 'Recorrência criada',
        description: frequency === 'monthly' ? 'O item recorrente foi salvo.' : 'O item foi salvo. Frequências não mensais ainda usam o mesmo motor mensal do sistema.'
      });
      onCreated?.();
      onClose();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Erro ao criar recorrência',
        description: error instanceof Error ? error.message : 'Falha ao criar recorrência.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay/80 backdrop-blur-md" onClick={saving ? undefined : onClose} />

        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative flex w-full max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-3xl sm:max-h-[90vh]">
          <div className="flex items-center justify-between border-b border-border/60 p-4 pb-4 sm:p-6 sm:pb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Repeat size={18} className="text-primary" />
              Nova Recorrência
            </h2>
            <button onClick={onClose} disabled={saving} className="p-2 bg-secondary/40 hover:bg-secondary/80 rounded-full transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
            <div className="flex bg-muted/40 p-1 rounded-xl border border-border/60">
              <button onClick={() => setType('expense')} className={cn('flex-1 py-2 rounded-lg text-sm font-medium transition-colors', type === 'expense' ? 'bg-error/20 text-error' : 'text-muted-foreground hover:text-muted-foreground')}>
                Despesa
              </button>
              <button onClick={() => setType('income')} className={cn('flex-1 py-2 rounded-lg text-sm font-medium transition-colors', type === 'income' ? 'bg-success/20 text-success' : 'text-muted-foreground hover:text-muted-foreground')}>
                Receita
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Descrição</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Netflix, Aluguel, Salário..." className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50 transition-colors text-foreground placeholder:text-muted-foreground" />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Valor</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-muted/40 border border-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary/50 transition-colors text-foreground placeholder:text-muted-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Frequência</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50 transition-colors text-foreground cursor-pointer appearance-none">
                  <option value="monthly" className="bg-popover">Mensal</option>
                  <option value="weekly" className="bg-popover">Semanal</option>
                  <option value="yearly" className="bg-popover">Anual</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Dia do Vencimento</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="number" min="1" max="31" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary/50 transition-colors text-foreground" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 p-4 pt-0 sm:p-6 sm:pt-0">
            <button onClick={() => void handleSave()} disabled={!isValid} className={cn('w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all', isValid ? 'bg-primary text-foreground hover:bg-primary/90' : 'bg-muted/40 text-muted-foreground cursor-not-allowed border border-border/60')}>
              <Check size={18} />
              Salvar Recorrência
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

