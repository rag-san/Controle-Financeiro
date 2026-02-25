"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  ImportTransactionsContent,
  type ImportTransactionsContentHandle,
  type ImportTransactionsFooterState
} from "@/components/import/ImportTransactionsContent";
import type { AccountDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";

type ImportTransactionsModalProps = {
  open: boolean;
  accounts: AccountDTO[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
  onAccountsRefresh?: () => Promise<void> | void;
  triggerRef?: React.RefObject<HTMLElement | null>;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const elements = container.querySelectorAll<HTMLElement>(selectors);
  return [...elements].filter((element) => !element.hasAttribute("aria-hidden"));
}

const initialFooterState: ImportTransactionsFooterState = {
  validRows: 0,
  errorRows: 0,
  ignoredRows: 0,
  importing: false,
  canImport: false,
  importLabel: "Importar 0 linhas"
};

export function ImportTransactionsModal({
  open,
  accounts,
  onOpenChange,
  onSuccess,
  onAccountsRefresh,
  triggerRef
}: ImportTransactionsModalProps): React.JSX.Element | null {
  const [mounted, setMounted] = React.useState(false);
  const [footerState, setFooterState] = React.useState<ImportTransactionsFooterState>(initialFooterState);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<ImportTransactionsContentHandle | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFooterState(initialFooterState);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      const focusTarget = triggerRef?.current ?? previousFocusRef.current;
      focusTarget?.focus();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open, triggerRef]);

  React.useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
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
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === first || !dialogRef.current.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleImport = React.useCallback(async (): Promise<void> => {
    await contentRef.current?.submitImport();
  }, []);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        onClick={handleClose}
        aria-label="Fechar importação"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-transactions-modal-title"
        className="relative z-[131] flex h-[100dvh] w-full max-w-none flex-col overflow-hidden border border-border bg-card shadow-2xl sm:h-[min(90vh,900px)] sm:max-w-5xl sm:rounded-2xl"
      >
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
          <h2 id="import-transactions-modal-title" className="text-base font-semibold">
            Importação de arquivo
          </h2>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            aria-label="Fechar importação"
          >
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
          <ImportTransactionsContent
            ref={contentRef}
            accounts={accounts}
            onAccountsRefresh={onAccountsRefresh}
            onFooterStateChange={setFooterState}
            showInlineCommitButton={false}
            previewMaxHeightClassName="max-h-[42vh] sm:max-h-[430px]"
            onSuccess={async () => {
              await onSuccess();
              handleClose();
            }}
          />
        </div>

        <footer className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            Linhas válidas: {footerState.validRows} | Erros: {footerState.errorRows} | Ignoradas:{" "}
            {footerState.ignoredRows}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={handleClose}
              disabled={footerState.importing}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 sm:flex-none"
              onClick={() => void handleImport()}
              isLoading={footerState.importing}
              disabled={!footerState.canImport}
            >
              {footerState.importLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
