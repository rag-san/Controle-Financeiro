"use client";

import { Recurring } from "@/src/features/recurring/RecurringPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function RecurringRoutePage(): React.JSX.Element {
  const { hideValues } = useNovaShell();
  return <Recurring hideValues={hideValues} />;
}
