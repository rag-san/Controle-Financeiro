"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  Landmark,
  LayoutDashboard,
  LineChart,
  LogOut,
  LucideIcon,
  Receipt,
  Repeat2,
  Settings,
  Tags,
  WalletCards,
  X
} from "lucide-react";
import { SidebarItem } from "@/components/layout/SidebarItem";
import { IconButton } from "@/src/components/ui/IconButton";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: Receipt },
  { href: "/cashflow", label: "Fluxo de Caixa", icon: BarChart3 },
  { href: "/accounts", label: "Contas", icon: Landmark },
  { href: "/net-worth", label: "Patrimônio", icon: LineChart },
  { href: "/recurring", label: "Recorrentes", icon: Repeat2 },
  { href: "/categories", label: "Categorias", icon: Tags },
  { href: "/reports", label: "Relatórios", icon: FileText },
  { href: "/review", label: "Revisão", icon: ClipboardCheck }
];

const FOOTER_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Configurações", icon: Settings }
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

function isRouteActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <WalletCards className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-wide text-slate-900 dark:text-slate-100">Finance Control</span>
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label="Navegação principal">
        {MAIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <SidebarItem
              key={item.href}
              to={item.href}
              label={item.label}
              isActive={isRouteActive(pathname, item.href)}
              onNavigate={onNavigate}
              icon={<Icon className="h-4 w-4" />}
            />
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border px-3 py-4">
        <nav className="space-y-1" aria-label="Navegação secundária">
          {FOOTER_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarItem
                key={item.href}
                to={item.href}
                label={item.label}
                isActive={isRouteActive(pathname, item.href)}
                onNavigate={onNavigate}
                icon={<Icon className="h-4 w-4" />}
              />
            );
          })}
        </nav>

        <button
          type="button"
          className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
          onClick={() => {
            signOut({ callbackUrl: "/login" });
          }}
        >
          <LogOut className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          Sair
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps): React.JSX.Element {
  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 border-r border-border bg-card md:block">
        <SidebarContent />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="absolute left-0 top-0 h-screen w-[85vw] max-w-72 border-r border-border bg-card shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Menu</span>
              <IconButton aria-label="Fechar menu lateral" onClick={onClose} icon={<X className="h-4 w-4" />} />
            </div>
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      ) : null}
    </>
  );
}


