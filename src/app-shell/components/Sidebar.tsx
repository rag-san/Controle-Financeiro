import React from 'react';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  BarChart3, 
  Wallet, 
  TrendingUp, 
  Calendar, 
  Tags, 
  PieChart,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../utils';
import { ViewType } from '../types';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  hideValues: boolean;
  setHideValues: (hide: boolean) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transações', icon: ArrowRightLeft },
  { id: 'cashflow', label: 'Fluxo de Caixa', icon: BarChart3 },
  { id: 'accounts', label: 'Contas', icon: Wallet },
  { id: 'wealth', label: 'Patrimônio', icon: TrendingUp },
  { id: 'recurring', label: 'Recorrentes', icon: Calendar },
  { id: 'categories', label: 'Categorias', icon: Tags },
  { id: 'reports', label: 'Relatórios', icon: PieChart },
] as const;

export function Sidebar({ 
  currentView, 
  onViewChange, 
  isCollapsed, 
  setIsCollapsed,
  hideValues,
  setHideValues
}: SidebarProps) {
  return (
    <aside 
      className={cn(
        "sticky top-0 z-50 flex h-dvh flex-col overflow-y-auto glass-panel transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-[240px]"
      )}
    >
      <div className="flex items-center justify-between p-5">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-foreground shadow-sm">F</div>
            <span className="font-bold text-lg tracking-tight text-foreground">finança</span>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-foreground mx-auto shadow-sm">F</div>
        )}
      </div>

      <div className="mb-6 px-4">
        <button 
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm transition-all duration-200 hover:border-border hover:text-foreground",
            isCollapsed && "justify-center"
          )}
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        >
          <Search size={16} />
          {!isCollapsed && <span>Buscar...</span>}
          {!isCollapsed && <span className="ml-auto text-[10px] bg-background px-1.5 py-0.5 rounded border border-border text-muted-foreground">⌘K</span>}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id as ViewType)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 group",
              currentView === item.id 
                ? "bg-focus text-foreground font-medium" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              isCollapsed && "justify-center"
            )}
          >
            <item.icon size={18} className={cn(
              "transition-colors",
              currentView === item.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )} />
            {!isCollapsed && <span className="text-sm tracking-wide">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border p-4">
        <button
          onClick={() => setHideValues(!hideValues)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground",
            isCollapsed && "justify-center"
          )}
        >
          {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
          {!isCollapsed && <span className="text-sm tracking-wide">{hideValues ? 'Mostrar valores' : 'Esconder valores'}</span>}
        </button>
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground",
            isCollapsed && "justify-center"
          )}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!isCollapsed && <span className="text-sm tracking-wide">Recolher</span>}
        </button>

        <div className={cn(
          "mt-2 flex items-center gap-3 border-t border-border px-2 pt-4",
          isCollapsed && "justify-center"
        )}>
          <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0 text-xs font-medium text-foreground shadow-sm">RA</div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-foreground">Rodrigo A.</div>
                <div className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase truncate mt-0.5">Pro Plan</div>
              </div>
              <button className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-all duration-200">
                <ArrowRightLeft size={14} className="rotate-90" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

