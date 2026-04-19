"use client";

import { useState } from "react";
import { useTheme } from "@/src/components/layout/ThemeProvider";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { BottomNav } from "@/src/app-shell/components/BottomNav";
import { CommandBar } from "@/src/app-shell/components/CommandBar";
import { MobileMenuModal } from "@/src/app-shell/components/MobileMenuModal";
import { Sidebar } from "@/src/app-shell/components/Sidebar";
import { ImportModal } from "@/src/features/transactions/components/ImportModal";
import { NewTransactionModal } from "@/src/features/transactions/components/NewTransactionModal";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { currentView } = useAppShell();

  return (
    <div className="flex min-h-dvh bg-background text-foreground selection:bg-primary/20">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <main className="w-full flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto min-h-dvh w-full max-w-7xl px-3 py-4 mobile-bottom-padding sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="mb-3 flex justify-end sm:mb-6">
            <button
              onClick={toggleTheme}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
          {children}
        </div>
      </main>

      <BottomNav onOpenMenu={() => setIsMobileMenuOpen(true)} />
      <MobileMenuModal isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <CommandBar />
      <NewTransactionModal />
      <ImportModal />

      <div className="sr-only">{currentView}</div>
    </div>
  );
}
