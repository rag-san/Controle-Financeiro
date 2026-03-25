import React, { useState, useEffect } from 'react';
import { X, Check, Tag, Palette } from 'lucide-react';
import { motion, AnimatePresence as MotionAnimatePresence } from 'motion/react';
import type { CategoryDTO } from '@/lib/types';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import { useToast } from '@/src/components/ui/ToastProvider';
import { cn } from '@/src/app-shell/utils';
import { CATEGORY_COLOR_SWATCHES } from '@/src/features/categories/categoryColors';

const AnimatePresence = MotionAnimatePresence as unknown as React.ComponentType<React.PropsWithChildren>;

interface NewCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (category: CategoryDTO) => void;
}

export function NewCategoryModal({ isOpen, onClose, onCreated }: NewCategoryModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [color, setColor] = useState<string>(CATEGORY_COLOR_SWATCHES[0]);
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('expense');
      setColor(CATEGORY_COLOR_SWATCHES[0]);
      setBudget('');
      setSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = name.trim() !== '' && !saving;

  const handleCreate = async (): Promise<void> => {
    if (!isValid) return;

    setSaving(true);
    try {
      const selectedColor = CATEGORY_COLOR_SWATCHES.includes(color as (typeof CATEGORY_COLOR_SWATCHES)[number])
        ? color
        : CATEGORY_COLOR_SWATCHES[0];
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          color: selectedColor,
          icon: type === 'income' ? 'wallet' : 'tag',
          parentId: null
        })
      });

      const { data, errorMessage } = await parseApiResponse<CategoryDTO | { error?: unknown }>(response);
      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !data || Array.isArray(data) || !('id' in data)) {
        throw new Error(extractApiError(data, 'Não foi possível criar a categoria.'));
      }

      toast({
        variant: 'success',
        title: 'Categoria criada',
        description: `${name.trim()} foi adicionada com sucesso.`
      });
      onCreated?.(data as CategoryDTO);
      onClose();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Erro ao criar categoria',
        description: error instanceof Error ? error.message : 'Falha ao criar categoria.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay/80 backdrop-blur-md" onClick={saving ? undefined : onClose} />

        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative flex w-full max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-3xl border border-border bg-popover shadow-2xl sm:max-w-md sm:rounded-3xl sm:max-h-[90vh]">
          <div className="flex items-center justify-between border-b border-border/70 p-4 pb-4 sm:p-6 sm:pb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Tag size={18} className="text-primary" />
              Nova Categoria
            </h2>
            <button onClick={onClose} disabled={saving} className="rounded-full bg-secondary/50 p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
            <div className="flex rounded-xl border border-border/70 bg-secondary/40 p-1">
              <button onClick={() => setType('expense')} className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-colors', type === 'expense' ? 'bg-error/20 text-error' : 'text-muted-foreground hover:text-foreground')}>
                Despesa
              </button>
              <button onClick={() => setType('income')} className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-colors', type === 'income' ? 'bg-success/20 text-success' : 'text-muted-foreground hover:text-foreground')}>
                Receita
              </button>
            </div>

            <div className="space-y-3">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome da Categoria</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação, Lazer..." className="w-full rounded-xl border border-border/80 bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50" />
            </div>

            <div className="space-y-3">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Orçamento Mensal (Opcional)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-border/80 bg-card pl-10 pr-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="ml-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Palette size={12} /> Cor
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLOR_SWATCHES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setColor(item)}
                    className={cn(
                      'h-8 w-8 rounded-full transition-transform',
                      color === item
                        ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                        : 'opacity-60 hover:scale-110 hover:opacity-100'
                    )}
                    style={{ backgroundColor: item }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 p-4 pt-0 sm:p-6 sm:pt-0">
            <button onClick={() => void handleCreate()} disabled={!isValid} className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all', isValid ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'cursor-not-allowed border border-border/60 bg-secondary/40 text-muted-foreground/50')}>
              <Check size={18} />
              Criar Categoria
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
