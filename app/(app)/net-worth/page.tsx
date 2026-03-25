"use client";

import { Wealth } from "@/src/features/networth/NetWorthPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function NetWorthRoutePage(): React.JSX.Element {
  const { hideValues } = useNovaShell();
  return <Wealth hideValues={hideValues} />;
}
