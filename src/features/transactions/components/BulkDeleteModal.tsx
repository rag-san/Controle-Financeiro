"use client";

import * as React from "react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";

type BulkDeleteModalProps = {
  open: boolean;
  selectedCount: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

const DELETE_CONFIRMATION_VALUE = "DELETE";

export function BulkDeleteModal({
  open,
  selectedCount,
  busy = false,
  onClose,
  onConfirm
}: BulkDeleteModalProps): React.JSX.Element | null {
  const [typedValue, setTypedValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTypedValue("");

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
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
  }, [onClose, open]);

  React.useEffect(() => {
    if (open) return;
    previousFocusRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  const canConfirm = typedValue.trim().toUpperCase() === DELETE_CONFIRMATION_VALUE;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-modal-title"
        className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950"
      >
        <h2 id="bulk-delete-modal-title" className="text-base font-semibold text-foreground">
          Confirmar exclusao
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta acao removera {selectedCount} transacao(oes). Digite <span className="font-semibold">DELETE</span> para continuar.
        </p>

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canConfirm || busy) return;
            void onConfirm();
          }}
        >
          <div>
            <label htmlFor="bulk-delete-confirm" className="mb-1 block text-sm font-medium text-muted-foreground">
              Confirmacao
            </label>
            <Input
              ref={inputRef}
              id="bulk-delete-confirm"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              placeholder="Digite DELETE"
              disabled={busy}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={busy}
              disabled={!canConfirm || busy}
            >
              Excluir selecionadas
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
