"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TransactionDTO } from "@/lib/types";
import type { ViewType } from "@/src/app-shell/types";
import { resolveViewFromPathname, VIEW_TO_PATH } from "@/src/app-shell/routes";

const HIDE_VALUES_STORAGE_KEY = "finance-control:nova:hide-values";
const SIDEBAR_STORAGE_KEY = "finance-control:nova:sidebar-collapsed";

type NovaShellContextType = {
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

const NovaShellContext = createContext<NovaShellContextType | null>(null);

function parseStoredBoolean(value: string | null, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function NovaShellProvider({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
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
    setHideValuesState(parseStoredBoolean(window.localStorage.getItem(HIDE_VALUES_STORAGE_KEY), false));
    setSidebarCollapsedState(parseStoredBoolean(window.localStorage.getItem(SIDEBAR_STORAGE_KEY), false));
  }, []);

  const updateQueryFlag = useCallback(
    (key: "new" | "import", nextOpen: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextOpen) {
        params.set(key, "1");
      } else {
        params.delete(key);
      }

      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
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

  const setHideValues = useCallback((hide: boolean) => {
    setHideValuesState(hide);
    window.localStorage.setItem(HIDE_VALUES_STORAGE_KEY, String(hide));
  }, []);

  const setIsSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, []);

  const openTransactionModal = useCallback(
    (transaction?: TransactionDTO | null) => {
      setEditingTransaction(transaction ?? null);
      updateQueryFlag("new", true);
    },
    [updateQueryFlag]
  );

  const closeTransactionModal = useCallback(() => {
    setEditingTransaction(null);
    updateQueryFlag("new", false);
  }, [updateQueryFlag]);

  const openImportModal = useCallback(() => {
    updateQueryFlag("import", true);
  }, [updateQueryFlag]);

  const closeImportModal = useCallback(() => {
    updateQueryFlag("import", false);
  }, [updateQueryFlag]);

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

  return <NovaShellContext.Provider value={value}>{children}</NovaShellContext.Provider>;
}

export function useNovaShell(): NovaShellContextType {
  const context = useContext(NovaShellContext);
  if (!context) {
    throw new Error("useNovaShell must be used within NovaShellProvider");
  }
  return context;
}

export { NovaShellProvider as AppShellProvider };
