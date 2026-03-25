"use client";

import { Accounts } from "@/src/features/accounts/AccountsPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function AccountsRoutePage(): React.JSX.Element {
  const { hideValues } = useNovaShell();
  return <Accounts hideValues={hideValues} />;
}
