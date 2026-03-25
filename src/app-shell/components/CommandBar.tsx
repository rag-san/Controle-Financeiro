import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ArrowRight, 
  Plus, 
  Command, 
  LayoutDashboard, 
  ArrowRightLeft,
  BarChart3,
  Wallet,
  TrendingUp,
  Calendar,
  Tags,
  PieChart
} from 'lucide-react';
import { motion, AnimatePresence as MotionAnimatePresence } from 'motion/react';
import { ViewType } from '../types';

const AnimatePresence = MotionAnimatePresence as unknown as React.ComponentType<React.PropsWithChildren<{ mode?: 'wait' }>>;

interface CommandBarProps {
  onViewChange: (view: ViewType) => void;
  onNewTransaction: () => void;
}

export function CommandBar({ onViewChange, onNewTransaction }: CommandBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const COMMANDS = [
    { id: 'dashboard', label: 'Ir para Dashboard', icon: LayoutDashboard, category: 'Navegação' },
    { id: 'transactions', label: 'Ir para Transações', icon: ArrowRightLeft, category: 'Navegação' },
    { id: 'cashflow', label: 'Ir para Fluxo de Caixa', icon: BarChart3, category: 'Navegação' },
    { id: 'accounts', label: 'Ir para Contas', icon: Wallet, category: 'Navegação' },
    { id: 'wealth', label: 'Ir para Patrimônio', icon: TrendingUp, category: 'Navegação' },
    { id: 'recurring', label: 'Ir para Recorrentes', icon: Calendar, category: 'Navegação' },
    { id: 'categories', label: 'Ir para Categorias', icon: Tags, category: 'Navegação' },
    { id: 'reports', label: 'Ir para Relatórios', icon: PieChart, category: 'Navegação' },
    { id: 'add-transaction', label: 'Nova Transação', icon: Plus, category: 'Ações' },
  ];

  const filteredCommands = COMMANDS.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase()) ||
    cmd.category.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-start sm:px-4 sm:pt-[20vh]">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-overlay/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative w-full max-w-xl overflow-hidden rounded-t-3xl border border-border shadow-2xl glass-card sm:rounded-xl"
          >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="text-muted-foreground mr-3" size={20} />
            <input
              autoFocus
              className="min-w-0 flex-1 border-none bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              placeholder="O que você deseja fazer? (Cmd+K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="hidden items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground sm:flex">
              ESC
            </div>
          </div>

          <div className="max-h-[55dvh] overflow-y-auto p-2 sm:max-h-[400px]">
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd) => (
                <button 
                  key={cmd.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-sm text-left transition-colors group"
                  onClick={() => {
                    if (cmd.category === 'Navegação') {
                      onViewChange(cmd.id as ViewType);
                    } else if (cmd.id === 'add-transaction') {
                      onNewTransaction();
                    }
                    setIsOpen(false);
                  }}
                >
                  <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                    <cmd.icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{cmd.label}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{cmd.category}</div>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhum comando encontrado para &quot;{search}&quot;
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border bg-secondary px-4 py-3 text-[10px] text-muted-foreground backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-border bg-card">↑↓</kbd> Navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-border bg-card">ENTER</kbd> Selecionar
              </span>
            </div>
            <div className="flex items-center gap-1 self-end sm:self-auto">
              AUREUM <Command size={10} />
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

