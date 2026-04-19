"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TransactionDTO } from "@/lib/types";
import { VIEW_TO_PATH, resolveViewFromPathname } from "@/src/app-shell/routes";
import type { ViewType } from "@/src/app-shell/types";

type AppShellContextValue = {
  currentView: ViewType;
  hideValues: boolean;
  isSidebarCollapsed: boolean;
  isTransactionModalOpen: boolean;
  isImportModalOpen: boolean;
  editingTransaction: TransactionDTO | null;
  navigateToView: (view: ViewType) => void;
  setHideValues: (hide: boolean) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  openTransactionModal: (transaction?: TransactionDTO | null) => void;
  closeTransactionModal: () => void;
  openImportModal: () => void;
  closeImportModal: () => void;
};

const HIDE_VALUES_KEY = "finance-control:hide-values";
const SIDEBAR_KEY = "finance-control:sidebar-collapsed";
const AppShellContext = createContext<AppShellContextValue | null>(null);

function parseStoredBoolean(value: string | null, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function AppShellProvider({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hideValues, setHideValuesState] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionDTO | null>(null);
  const currentView = useMemo(() => resolveViewFromPathname(pathname), [pathname]);
  const isTransactionModalOpen = searchParams.get("new") === "1";
  const isImportModalOpen = searchParams.get("import") === "1";

  useEffect(() => {
    setHideValuesState(parseStoredBoolean(window.localStorage.getItem(HIDE_VALUES_KEY), false));
    setSidebarCollapsedState(parseStoredBoolean(window.localStorage.getItem(SIDEBAR_KEY), false));
  }, []);

  const updateFlag = useCallback(
    (key: "new" | "import", nextOpen: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextOpen) {
        params.set(key, "1");
      } else {
        params.delete(key);
      }

      const nextQuery = params.toString();
      router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (!isTransactionModalOpen) {
      setEditingTransaction(null);
    }
  }, [isTransactionModalOpen]);

  const navigateToView = useCallback(
    (view: ViewType) => {
      router.push(VIEW_TO_PATH[view]);
    },
    [router]
  );

  const setHideValues = useCallback((hide: boolean): void => {
    setHideValuesState(hide);
    window.localStorage.setItem(HIDE_VALUES_KEY, String(hide));
  }, []);

  const setIsSidebarCollapsed = useCallback((collapsed: boolean): void => {
    setSidebarCollapsedState(collapsed);
    window.localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  }, []);

  const openTransactionModal = useCallback(
    (transaction?: TransactionDTO | null) => {
      setEditingTransaction(transaction ?? null);
      updateFlag("new", true);
    },
    [updateFlag]
  );

  const closeTransactionModal = useCallback(() => {
    setEditingTransaction(null);
    updateFlag("new", false);
  }, [updateFlag]);

  const openImportModal = useCallback(() => {
    updateFlag("import", true);
  }, [updateFlag]);

  const closeImportModal = useCallback(() => {
    updateFlag("import", false);
  }, [updateFlag]);

  const value = useMemo(
    () => ({
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
      openImportModal,
      closeImportModal
    }),
    [
      closeImportModal,
      closeTransactionModal,
      currentView,
      editingTransaction,
      hideValues,
      isImportModalOpen,
      isSidebarCollapsed,
      isTransactionModalOpen,
      navigateToView,
      openImportModal,
      openTransactionModal,
      setHideValues,
      setIsSidebarCollapsed
    ]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return context;
}
