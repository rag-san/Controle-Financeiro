"use client";

import { Sidebar } from "@/src/app-shell/components/Sidebar";
import { BottomNav } from "@/src/app-shell/components/BottomNav";
import { CommandBar } from "@/src/app-shell/components/CommandBar";
import { ImportModal } from "@/src/features/transactions/components/ImportTransactionsModal";
import { NewTransactionModal } from "@/src/features/transactions/components/NewTransactionModal";
import { useTheme } from "@/src/components/layout/ThemeProvider";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export function NovaAppShell({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const {
    currentView,
    hideValues,
    isSidebarCollapsed,
    isTransactionModalOpen,
    isImportModalOpen,
    editingTransaction,
    navigateToView,
    setHideValues,
    setIsSidebarCollapsed,
    openTransactionModal,
    closeTransactionModal,
    closeImportModal
  } = useNovaShell();

  return (
    <div className="flex min-h-dvh bg-background text-foreground selection:bg-primary/30">
      <div className="hidden md:block">
        <Sidebar
          currentView={currentView}
          onViewChange={navigateToView}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          hideValues={hideValues}
          setHideValues={setHideValues}
        />
      </div>

      <main className="w-full flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto min-h-dvh w-full max-w-7xl px-3 py-4 mobile-bottom-padding sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="mb-3 flex justify-end sm:mb-6">
            <button
              onClick={toggleTheme}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
            >
              {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>
          </div>
          {children}
        </div>
      </main>

      <BottomNav
        currentView={currentView}
        onViewChange={navigateToView}
        onNewTransaction={() => openTransactionModal()}
      />

      <CommandBar onViewChange={navigateToView} onNewTransaction={() => openTransactionModal()} />

      <NewTransactionModal
        isOpen={isTransactionModalOpen}
        onClose={closeTransactionModal}
        transaction={editingTransaction}
      />

      <ImportModal isOpen={isImportModalOpen} onClose={closeImportModal} />
    </div>
  );
}

export { NovaAppShell as AppShell };

