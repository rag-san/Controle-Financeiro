"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/src/components/ui/Modal";
import { Button } from "@/src/components/ui/Button";

type DeleteAccountModalProps = {
  open: boolean;
  accountName: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

export function DeleteAccountModal({
  open,
  accountName,
  busy = false,
  onClose,
  onConfirm
}: DeleteAccountModalProps): React.JSX.Element | null {
  return (
    <Modal
      open={open}
      title="Tem certeza que deseja apagar esta conta?"
      description="Ao confirmar, a conta será removida e todas as transações vinculadas a ela também serão apagadas."
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={() => void onConfirm()} isLoading={busy} disabled={busy}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning dark:border-warning/20 dark:bg-warning/10 dark:text-warning">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Você está prestes a apagar: <strong>{accountName}</strong>
          </span>
        </p>
      </div>
    </Modal>
  );
}

