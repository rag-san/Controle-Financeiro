"use client";

import * as React from "react";
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
  const parentAccounts = React.useMemo(
    () => accounts.filter((account) => account.type !== "credit"),
    [accounts]
  );

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-account-modal-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="space-y-1">
          <h2 id="connect-account-modal-title" className="text-lg font-semibold text-foreground">
            Conectar conta
          </h2>
          <p className="text-sm text-muted-foreground">
            Adicione uma conta manualmente enquanto a integração bancária automática não está ativa.
          </p>
          <p className="text-xs text-muted-foreground">
            TODO: Integrar fluxo de Open Banking para conexão direta com instituições.
          </p>
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
              onChange={(event) => setDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
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

          <div className="sm:col-span-2 mt-1 flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={busy}
              disabled={busy || draft.name.trim().length < 2}
            >
              Salvar conta
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
