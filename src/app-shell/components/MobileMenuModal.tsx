"use client";

import { X, Landmark, Tag, LineChart, PieChart, Repeat, FileText, Search } from "lucide-react";
import { motion } from "motion/react";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import type { ViewType } from "@/src/app-shell/types";
import { cn } from "@/src/app-shell/utils";

type MobileMenuModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function MobileMenuModal({ isOpen, onClose }: MobileMenuModalProps): React.JSX.Element | null {
  const { currentView, navigateToView } = useAppShell();

  const items: Array<{ id: ViewType; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: "accounts", label: "Contas", icon: Landmark },
    { id: "categories", label: "Categorias", icon: Tag },
    { id: "cashflow", label: "Fluxo de Caixa", icon: LineChart },
    { id: "wealth", label: "Patrimonio", icon: PieChart },
    { id: "recurring", label: "Recorrencias", icon: Repeat },
    { id: "reports", label: "Relatorios", icon: FileText }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 md:hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-border bg-card shadow-2xl"
      >
        <div className="relative z-20 flex w-full justify-center pb-1 pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between border-b border-border p-6 pb-4">
          <h2 className="text-xl font-semibold text-foreground">Menu</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new Event("open-command-bar"));
              }}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Buscar"
            >
              <Search size={20} />
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="hide-scrollbar overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigateToView(item.id);
                    onClose();
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-2xl border p-4 transition-all duration-200",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon size={28} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
