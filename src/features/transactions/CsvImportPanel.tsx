"use client";

import * as React from "react";
import { X } from "lucide-react";
import { ImportWizard } from "@/components/imports/ImportWizard";
import type { AccountDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";

type CsvImportPanelProps = {
  open: boolean;
  accounts: AccountDTO[];
  onClose: () => void;
  onSuccess: () => void;
  onAccountsRefresh?: () => Promise<void> | void;
};

export function CsvImportPanel({
  open,
  accounts,
  onClose,
  onSuccess,
  onAccountsRefresh
}: CsvImportPanelProps): React.JSX.Element | null {
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <section className="space-y-3" aria-labelledby="csv-import-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="csv-import-title" className="text-base font-semibold">
          Importacao de arquivo
        </h2>
        <Button ref={closeButtonRef} type="button" variant="outline" size="sm" onClick={onClose} aria-label="Fechar importacao">
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </div>
      <ImportWizard accounts={accounts} onSuccess={onSuccess} onAccountsRefresh={onAccountsRefresh} />
    </section>
  );
}

