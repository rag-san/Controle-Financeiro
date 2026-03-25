"use client";

import { CashFlow } from "@/src/features/cashflow/CashflowPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function CashflowRoutePage(): React.JSX.Element {
  const { hideValues } = useNovaShell();
  return <CashFlow hideValues={hideValues} />;
}
