"use client";

import * as React from "react";
import type { CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";

export type NewCategoryPayload = {
  name: string;
  color: string;
  icon: string | null;
  parentId: string | null;
};

type NewCategoryModalProps = {
  open: boolean;
  busy?: boolean;
  categories: CategoryDTO[];
  onClose: () => void;
  onSubmit: (payload: NewCategoryPayload) => Promise<void> | void;
};

const initialForm = {
  name: "",
  color: "#3b82f6",
  icon: "",
  parentId: ""
};

export function NewCategoryModal({
  open,
  busy = false,
  categories,
  onClose,
  onSubmit
}: NewCategoryModalProps): React.JSX.Element | null {
  const [form, setForm] = React.useState(initialForm);

  React.useEffect(() => {
    if (!open) return;
    setForm(initialForm);
  }, [open]);

  if (!open) return null;

  const rootCategories = categories.filter((category) => !category.parentId);

  const handleSubmit = async (): Promise<void> => {
    if (!form.name.trim()) return;
    await onSubmit({
      name: form.name.trim(),
      color: form.color,
      icon: form.icon.trim() || null,
      parentId: form.parentId || null
    });
  };

  return (
    <Modal
      open={open}
      title="Nova categoria"
      description="Adicione uma categoria para organizar seus gastos."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSubmit()} isLoading={busy} disabled={busy}>
            Salvar
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
          <label htmlFor="new-category-name" className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Nome
          </label>
          <Input
            id="new-category-name"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="Ex.: Delivery"
            disabled={busy}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="new-category-color" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Cor
            </label>
            <Input
              id="new-category-color"
              type="color"
              value={form.color}
              onChange={(event) => setForm((previous) => ({ ...previous, color: event.target.value }))}
              disabled={busy}
              className="h-10"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="new-category-icon" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Ícone (opcional)
            </label>
            <Input
              id="new-category-icon"
              value={form.icon}
              onChange={(event) => setForm((previous) => ({ ...previous, icon: event.target.value }))}
              placeholder="🍔"
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="new-category-parent" className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Grupo pai (opcional)
          </label>
          <Select
            id="new-category-parent"
            value={form.parentId}
            onChange={(event) => setForm((previous) => ({ ...previous, parentId: event.target.value }))}
            disabled={busy}
          >
            <option value="">Sem grupo pai</option>
            {rootCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Modal>
  );
}
