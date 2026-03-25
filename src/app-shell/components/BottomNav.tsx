import React from 'react';
import { Home, ListOrdered, LineChart, Plus, MoreHorizontal } from 'lucide-react';
import { ViewType } from '../types';
import { cn } from '../utils';

interface BottomNavProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onNewTransaction: () => void;
}

export function BottomNav({ currentView, onViewChange, onNewTransaction }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Início' },
    { id: 'transactions', icon: ListOrdered, label: 'Transações' },
    { id: 'new', icon: Plus, label: 'Nova', isAction: true },
    { id: 'cashflow', icon: LineChart, label: 'Fluxo' },
    { id: 'more', icon: MoreHorizontal, label: 'Mais' },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border glass-card rounded-none pb-safe">
      <div className="flex items-center justify-between gap-1 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          if (item.isAction) {
            return (
              <button
              key={item.id}
              onClick={onNewTransaction}
              className="btn-active-scale -mt-6 flex h-12 w-12 flex-col items-center justify-center rounded-full bg-primary text-foreground shadow-lg"
            >
              <Icon size={24} />
            </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => item.id === 'more' ? onViewChange('categories') : onViewChange(item.id as ViewType)}
              className={cn(
                "btn-active-scale flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={20} />
              <span className="text-[9px] font-medium leading-none sm:text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

