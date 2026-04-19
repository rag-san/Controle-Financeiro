"use client";

import { signOut, useSession } from "next-auth/react";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutDashboard,
  LineChart,
  PieChart,
  Search,
  Tags,
  TrendingUp,
  Wallet
} from "lucide-react";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import type { ViewType } from "@/src/app-shell/types";
import { cn, getInitials } from "@/src/app-shell/utils";

const NAV_ITEMS: Array<{ id: ViewType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transacoes", icon: ArrowLeftRight },
  { id: "cashflow", label: "Fluxo de Caixa", icon: BarChart3 },
  { id: "accounts", label: "Contas", icon: Wallet },
  { id: "wealth", label: "Patrimonio", icon: TrendingUp },
  { id: "recurring", label: "Recorrentes", icon: LineChart },
  { id: "categories", label: "Categorias", icon: Tags },
  { id: "reports", label: "Relatorios", icon: PieChart }
];

export function Sidebar(): React.JSX.Element {
  const { data: session } = useSession();
  const {
    currentView,
    hideValues,
    isSidebarCollapsed,
    navigateToView,
    setHideValues,
    setIsSidebarCollapsed
  } = useAppShell();

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 flex h-screen flex-col glass-panel transition-all duration-300 ease-in-out",
        isSidebarCollapsed ? "w-20" : "w-[240px]"
      )}
    >
      <div className="flex items-center justify-between p-6">
        {isSidebarCollapsed ? (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground shadow-sm">
            F
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground shadow-sm">
              F
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">financa</span>
          </div>
        )}
      </div>

      <div className="mb-6 px-4">
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm transition-all duration-200 hover:border-border hover:text-foreground",
            isSidebarCollapsed && "justify-center"
          )}
          onClick={() => window.dispatchEvent(new Event("open-command-bar"))}
        >
          <Search size={16} />
          {!isSidebarCollapsed ? (
            <>
              <span>Buscar...</span>
              <span className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Ctrl K
              </span>
            </>
          ) : null}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateToView(item.id)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
              currentView === item.id
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              isSidebarCollapsed && "justify-center"
            )}
          >
            <item.icon
              size={18}
              className={cn(
                currentView === item.id ? "text-primary" : "text-muted-foreground transition-colors group-hover:text-foreground"
              )}
            />
            {!isSidebarCollapsed ? <span className="text-sm tracking-wide">{item.label}</span> : null}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button
          onClick={() => setHideValues(!hideValues)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground",
            isSidebarCollapsed && "justify-center"
          )}
        >
          {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
          {!isSidebarCollapsed ? <span className="text-sm tracking-wide">{hideValues ? "Mostrar valores" : "Esconder valores"}</span> : null}
        </button>

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground",
            isSidebarCollapsed && "justify-center"
          )}
        >
          {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!isSidebarCollapsed ? <span className="text-sm tracking-wide">Recolher</span> : null}
        </button>

        <div
          className={cn(
            "mt-2 flex items-center gap-3 border-t border-border px-2 pt-4",
            isSidebarCollapsed && "justify-center"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-medium text-foreground shadow-sm">
            {getInitials(session?.user?.name)}
          </div>

          {!isSidebarCollapsed ? (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{session?.user?.name ?? "Usuario"}</div>
                <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {session?.user?.email ?? "Conta ativa"}
                </div>
              </div>
              <button
                className="rounded-md p-1.5 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
                onClick={() => void signOut({ callbackUrl: "/login" })}
                title="Sair"
              >
                <ArrowLeftRight size={14} className="rotate-90" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
