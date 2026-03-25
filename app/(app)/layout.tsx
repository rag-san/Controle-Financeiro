import { Suspense } from "react";
import { NovaAppShell } from "@/src/app-shell/AppShell";
import { NovaShellProvider } from "@/src/app-shell/AppShellContext";

export default function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <NovaShellProvider>
        <NovaAppShell>{children}</NovaAppShell>
      </NovaShellProvider>
    </Suspense>
  );
}



