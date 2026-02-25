import { Suspense } from "react";
import { TransactionsPage } from "@/src/features/transactions/TransactionsPage";

export default function TransactionsRoutePage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando transações...</div>}>
      <TransactionsPage />
    </Suspense>
  );
}

