"use client";

import { Reports } from "@/src/features/reports/ReportsPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function ReportsRoutePage(): React.JSX.Element {
  const { hideValues } = useNovaShell();
  return <Reports hideValues={hideValues} />;
}


