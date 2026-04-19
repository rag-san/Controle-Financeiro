"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Calendar,
  Command,
  LayoutDashboard,
  PieChart,
  Plus,
  Search,
  Tags,
  TrendingUp,
  Wallet
} from "lucide-react";
import { motion } from "motion/react";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import type { ViewType } from "@/src/app-shell/types";

export function CommandBar(): React.JSX.Element | null {
  const { navigateToView, openTransactionModal } = useAppShell();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((previous) => !previous);
      }

      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const onCustomOpen = (): void => setIsOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-bar", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-bar", onCustomOpen);
    };
  }, []);

  const commands = useMemo(
    () => [
      { id: "dashboard", label: "Ir para Dashboard", icon: LayoutDashboard, category: "Navegacao" },
      { id: "transactions", label: "Ir para Transacoes", icon: ArrowLeftRight, category: "Navegacao" },
      { id: "cashflow", label: "Ir para Fluxo de Caixa", icon: BarChart3, category: "Navegacao" },
      { id: "accounts", label: "Ir para Contas", icon: Wallet, category: "Navegacao" },
      { id: "wealth", label: "Ir para Patrimonio", icon: TrendingUp, category: "Navegacao" },
      { id: "recurring", label: "Ir para Recorrentes", icon: Calendar, category: "Navegacao" },
      { id: "categories", label: "Ir para Categorias", icon: Tags, category: "Navegacao" },
      { id: "reports", label: "Ir para Relatorios", icon: PieChart, category: "Navegacao" },
      { id: "new-transaction", label: "Nova Transacao", icon: Plus, category: "Acoes" }
    ],
    []
  );

  const filtered = commands.filter((item) => {
    const normalized = search.toLowerCase();
    return item.label.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-2 pt-16 sm:px-4 sm:pt-[20vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-xl overflow-hidden rounded-xl glass-card shadow-2xl"
      >
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search className="mr-3 text-muted-foreground" size={20} />
          <input
            autoFocus
            className="flex-1 border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="O que voce deseja fazer?"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="hidden items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
            ESC
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.id}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                onClick={() => {
                  if (item.category === "Navegacao") {
                    navigateToView(item.id as ViewType);
                  } else {
                    openTransactionModal();
                  }
                  setIsOpen(false);
                }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <item.icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{item.label}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.category}</div>
                </div>
                <ArrowRight size={16} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum comando encontrado para &quot;{search}&quot;</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-secondary px-4 py-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Ctrl K</span>
            <span>Enter</span>
          </div>
          <div className="flex items-center gap-1">
            FINANCA <Command size={10} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
