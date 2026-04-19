import { Suspense } from "react";
import { AppShellProvider } from "@/src/app-shell/AppShellContext";
import { AppShell } from "@/src/app-shell/AppShell";

export default function ProtectedLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AppShellProvider>
        <AppShell>{children}</AppShell>
      </AppShellProvider>
    </Suspense>
  );
}
