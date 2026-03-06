"use client";

import dynamic from "next/dynamic";

const TransactionsPage = dynamic(
  () => import("@/src/features/transactions/TransactionsPage").then((module) => module.TransactionsPage),
  {
    ssr: false,
    loading: () => <div className="p-4 text-sm text-muted-foreground">Carregando transações...</div>
  }
);

export function TransactionsPageClient(): React.JSX.Element {
  return <TransactionsPage />;
}
