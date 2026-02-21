"use client";

import * as React from "react";
import type { CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/Select";

type BulkCategoryModalProps = {
  open: boolean;
  categories: CategoryDTO[];
  selectedCount: number;
  busy?: boolean;
  progress?: { done: number; total: number } | null;
  onClose: () => void;
  onApply: (categoryId: string | null) => Promise<void> | void;
};

export function BulkCategoryModal({
  open,
  categories,
  selectedCount,
  busy = false,
  progress = null,
  onClose,
  onApply
}: BulkCategoryModalProps): React.JSX.Element | null {
  const [selectedCategoryId, setSelectedCategoryId] = React.useState("");
  const selectRef = React.useRef<HTMLSelectElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedCategoryId(categories[0]?.id ?? "");

    const timeoutId = window.setTimeout(() => {
      selectRef.current?.focus();
    }, 0);

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [categories, onClose, open]);

  React.useEffect(() => {
    if (open) return;
    previousFocusRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-category-modal-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 id="bulk-category-modal-title" className="text-base font-semibold text-foreground">
          Definir categoria
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aplicar categoria para {selectedCount} transacao(oes) selecionada(s).
        </p>

        <div className="mt-4">
          <label htmlFor="bulk-category-select" className="mb-1 block text-sm font-medium text-muted-foreground">
            Categoria
          </label>
          <Select
            ref={selectRef}
            id="bulk-category-select"
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
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

        {progress && progress.total > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            Processando {progress.done} de {progress.total}...
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void onApply(selectedCategoryId || null)}
            isLoading={busy}
            disabled={busy}
          >
            Aplicar
          </Button>
        </div>
      </div>
    </div>
  );
}
