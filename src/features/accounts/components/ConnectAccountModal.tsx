"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { AccountDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";

type ConnectAccountDraft = {
  name: string;
  type: AccountDTO["type"];
  institution: string;
  currency: string;
  parentAccountId: string;
};

type ConnectAccountModalProps = {
  open: boolean;
  accounts: AccountDTO[];
  busy?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmitManual: (draft: ConnectAccountDraft) => Promise<void> | void;
};

const initialDraft: ConnectAccountDraft = {
  name: "",
  type: "checking",
  institution: "",
  currency: "BRL",
  parentAccountId: ""
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const elements = container.querySelectorAll<HTMLElement>(selectors);
  return [...elements].filter((element) => !element.hasAttribute("aria-hidden"));
}

export function ConnectAccountModal({
  open,
  accounts,
  busy = false,
  errorMessage = "",
  onClose,
  onSubmitManual
}: ConnectAccountModalProps): React.JSX.Element | null {
  const [draft, setDraft] = React.useState<ConnectAccountDraft>(initialDraft);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const parentAccounts = React.useMemo(
    () => accounts.filter((account) => account.type !== "credit"),
    [accounts]
  );
  const canSubmit = draft.name.trim().length >= 2;
  const descriptionId = "connect-account-modal-description";

  React.useEffect(() => {
    if (draft.type === "credit") {
      return;
    }

    if (draft.parentAccountId) {
      setDraft((previous) => ({ ...previous, parentAccountId: "" }));
    }
  }, [draft.parentAccountId, draft.type]);

  React.useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(initialDraft);

    const timeoutId = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);

    const handleEscape = (event: KeyboardEvent): void => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        if (busy) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [busy, onClose, open]);

  React.useEffect(() => {
    if (open) return;
    previousFocusRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleClose = (): void => {
    if (busy) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        aria-label="Fechar modal de conta"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-account-modal-title"
        aria-describedby={descriptionId}
        className="relative z-[101] flex h-[100dvh] w-full flex-col overflow-hidden border border-border bg-card shadow-xl sm:h-auto sm:max-w-lg sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:rounded-t-2xl sm:px-6">
          <h2 id="connect-account-modal-title" className="text-lg font-semibold text-foreground">
            Conectar conta
          </h2>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            disabled={busy}
            aria-label="Fechar modal de conta"
            className="h-8 w-8 rounded-lg"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-1">
            <p id={descriptionId} className="text-sm text-muted-foreground">
              Adicione uma conta manualmente enquanto a integração bancária automática não está ativa.
            </p>
            <p className="text-xs text-muted-foreground">Integracao automatica via Open Banking em evolucao.</p>
          </div>

          <form
            className="mt-5 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitManual({
                ...draft,
                name: draft.name.trim(),
                institution: draft.institution.trim(),
                currency: draft.currency.trim().toUpperCase() || "BRL",
                parentAccountId: draft.type === "credit" ? draft.parentAccountId : ""
              });
            }}
          >
            <div className="sm:col-span-2">
              <label htmlFor="connect-account-name" className="mb-1 block text-sm font-medium text-muted-foreground">
                Nome da conta
              </label>
              <Input
                ref={nameInputRef}
                id="connect-account-name"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex.: Nubank Conta"
                disabled={busy}
                required
              />
            </div>

            <div>
              <label htmlFor="connect-account-type" className="mb-1 block text-sm font-medium text-muted-foreground">
                Tipo
              </label>
              <Select
                id="connect-account-type"
                value={draft.type}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, type: event.target.value as AccountDTO["type"] }))
                }
                disabled={busy}
              >
                <option value="checking">Conta corrente</option>
                <option value="credit">Cartão de crédito</option>
                <option value="cash">Dinheiro</option>
                <option value="investment">Investimento</option>
              </Select>
            </div>

            <div>
              <label htmlFor="connect-account-currency" className="mb-1 block text-sm font-medium text-muted-foreground">
                Moeda
              </label>
              <Input
                id="connect-account-currency"
                value={draft.currency}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
                }
                placeholder="BRL"
                maxLength={3}
                disabled={busy}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="connect-account-institution" className="mb-1 block text-sm font-medium text-muted-foreground">
                Instituicao (opcional)
              </label>
              <Input
                id="connect-account-institution"
                value={draft.institution}
                onChange={(event) => setDraft((prev) => ({ ...prev, institution: event.target.value }))}
                placeholder="Ex.: Nubank"
                disabled={busy}
              />
            </div>

            {draft.type === "credit" ? (
              <div className="sm:col-span-2">
                <label
                  htmlFor="connect-account-parent"
                  className="mb-1 block text-sm font-medium text-muted-foreground"
                >
                  Conta mae (opcional)
                </label>
                <Select
                  id="connect-account-parent"
                  value={draft.parentAccountId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, parentAccountId: event.target.value }))}
                  disabled={busy}
                >
                  <option value="">Sem conta mae</option>
                  {parentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {errorMessage ? (
              <p className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {errorMessage}
              </p>
            ) : null}

            <div className="sm:col-span-2 sticky bottom-0 mt-1 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              {!canSubmit ? (
                <p className="mr-auto text-xs text-muted-foreground">Informe ao menos o nome da conta.</p>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={handleClose} disabled={busy}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                isLoading={busy}
                disabled={busy || !canSubmit}
              >
                Salvar conta
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
