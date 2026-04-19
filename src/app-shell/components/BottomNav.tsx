"use client";

import { Home, LineChart, ListOrdered, MoreHorizontal, Plus } from "lucide-react";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { cn } from "@/src/app-shell/utils";
import type { ViewType } from "@/src/app-shell/types";

type BottomNavProps = {
  onOpenMenu: () => void;
};

export function BottomNav({ onOpenMenu }: BottomNavProps): React.JSX.Element {
  const { currentView, navigateToView, openTransactionModal } = useAppShell();

  const items: Array<{
    id: ViewType | "more" | "new";
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    action?: () => void;
  }> = [
    { id: "dashboard", label: "Inicio", icon: Home, action: () => navigateToView("dashboard") },
    { id: "transactions", label: "Transacoes", icon: ListOrdered, action: () => navigateToView("transactions") },
    { id: "new", label: "Nova", icon: Plus, action: () => openTransactionModal() },
    { id: "cashflow", label: "Fluxo", icon: LineChart, action: () => navigateToView("cashflow") },
    { id: "more", label: "Mais", icon: MoreHorizontal, action: onOpenMenu }
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 rounded-none border-x-0 border-b-0 border-t border-border glass-card pb-safe md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {items.map((item) => {
          const isAction = item.id === "new";
          const isActive = currentView === item.id;
          const Icon = item.icon;

          if (isAction) {
            return (
              <button
                key={item.id}
                onClick={item.action}
                className="btn-active-scale -mt-6 flex h-12 w-12 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <Icon size={24} />
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={item.action}
              className={cn(
                "btn-active-scale flex h-12 w-16 flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
