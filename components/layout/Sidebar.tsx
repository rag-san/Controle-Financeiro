"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  FileText,
  Landmark,
  LayoutDashboard,
  LineChart,
  Receipt,
  Repeat2,
  Settings,
  Tags,
  WalletCards,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transacoes", icon: Receipt },
  { href: "/cashflow", label: "Fluxo de Caixa", icon: BarChart3 },
  { href: "/accounts", label: "Contas", icon: Landmark },
  { href: "/net-worth", label: "Patrimonio", icon: LineChart },
  { href: "/recurring", label: "Recorrentes", icon: Repeat2 },
  { href: "/categories", label: "Categorias", icon: Tags },
  { href: "/reports", label: "Relatorios", icon: FileText },
  { href: "/settings", label: "Configuracoes", icon: Settings }
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <WalletCards className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-wide">VISOR</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border px-3 py-4 text-xs text-muted-foreground">
        <div className="rounded-xl bg-secondary/70 px-3 py-2">Plano gratuito</div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            signOut({ callbackUrl: "/login" });
          }}
        >
          Sair
        </Button>
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
              <span className="font-semibold">Menu</span>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      ) : null}
    </>
  );
}


