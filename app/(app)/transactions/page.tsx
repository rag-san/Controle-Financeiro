"use client";

import { Transactions } from "@/src/features/transactions/TransactionsPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function TransactionsRoutePage(): React.JSX.Element {
  const { hideValues, openTransactionModal, openImportModal } = useNovaShell();
  return (
    <Transactions
      hideValues={hideValues}
      onNewTransaction={openTransactionModal}
      onImport={openImportModal}
    />
  );
}

