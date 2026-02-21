"use client";

import * as React from "react";
import type { CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";
import type { RecurringFlowTab } from "@/src/features/recurring/types";

export type CreateRecurringPayload = {
  name: string;
  amount: number;
  dueDay: number;
  categoryId: string | null;
  flow: RecurringFlowTab;
  markAsPaidThisMonth: boolean;
};

type CreateRecurringModalProps = {
  open: boolean;
  flow: RecurringFlowTab;
  busy?: boolean;
  categories: CategoryDTO[];
  onClose: () => void;
  onSubmit: (payload: CreateRecurringPayload) => Promise<void> | void;
};

const initialForm = {
  name: "",
  amount: "",
  dueDay: String(new Date().getDate()),
  categoryId: "",
  markAsPaidThisMonth: false
};

export function CreateRecurringModal({
  open,
  flow,
  busy = false,
  categories,
  onClose,
  onSubmit
}: CreateRecurringModalProps): React.JSX.Element | null {
  const [form, setForm] = React.useState(initialForm);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      ...initialForm,
      categoryId: categories[0]?.id ?? ""
    });
  }, [open, categories]);

  if (!open) return null;

  const handleSubmit = async (): Promise<void> => {
    const amount = Number(form.amount);
    const dueDay = Number(form.dueDay);

    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(dueDay)) {
      return;
    }

    await onSubmit({
      name: form.name.trim(),
      amount,
      dueDay: Math.max(1, Math.min(31, dueDay)),
      categoryId: form.categoryId || null,
      flow,
      markAsPaidThisMonth: form.markAsPaidThisMonth
    });
  };

  return (
    <Modal
      open={open}
      title="Criar recorrente"
      description="Adicione uma nova assinatura ou conta recorrente."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSubmit()} isLoading={busy} disabled={busy}>
            Criar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="space-y-1">
          <label htmlFor="create-recurring-name" className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Nome
          </label>
          <Input
            id="create-recurring-name"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="Ex.: Netflix"
            disabled={busy}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="create-recurring-amount" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Valor (R$)
            </label>
            <Input
              id="create-recurring-amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))}
              disabled={busy}
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="create-recurring-due-day" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Dia de vencimento
            </label>
            <Input
              id="create-recurring-due-day"
              type="number"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(event) => setForm((previous) => ({ ...previous, dueDay: event.target.value }))}
              disabled={busy}
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="create-recurring-category" className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Categoria
          </label>
          <Select
            id="create-recurring-category"
            value={form.categoryId}
            onChange={(event) => setForm((previous) => ({ ...previous, categoryId: event.target.value }))}
            disabled={busy}
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={form.markAsPaidThisMonth}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, markAsPaidThisMonth: event.target.checked }))
            }
            disabled={busy}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Marcar como pago neste mês
        </label>
      </form>
    </Modal>
  );
}
