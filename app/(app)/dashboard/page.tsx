"use client";

import { Dashboard } from "@/src/features/dashboard/DashboardPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function DashboardPage(): React.JSX.Element {
  const { hideValues, openTransactionModal } = useNovaShell();
  return <Dashboard hideValues={hideValues} onNewTransaction={() => openTransactionModal()} />;
}
