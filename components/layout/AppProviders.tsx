"use client";

import { ThemeProvider } from "@/components/layout/ThemeProvider";

export function AppProviders({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <ThemeProvider>{children}</ThemeProvider>;
}


