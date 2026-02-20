"use client";

import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { ToastProvider } from "@/src/components/ui/ToastProvider";

export function AppProviders({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}


