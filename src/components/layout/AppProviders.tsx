"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/src/components/layout/ThemeProvider";

function AppChrome({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const { theme } = useTheme();

  return (
    <SessionProvider>
      {children}
      <Toaster
        richColors
        closeButton
        position="top-right"
        theme={theme}
        toastOptions={{
          className: "glass-card"
        }}
      />
    </SessionProvider>
  );
}

export function AppProviders({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppChrome>{children}</AppChrome>
    </ThemeProvider>
  );
}
