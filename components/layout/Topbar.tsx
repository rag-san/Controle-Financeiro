"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/layout/ThemeProvider";

type TopbarProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onOpenSidebar?: () => void;
};

export function Topbar({ title, subtitle, actions, onOpenSidebar }: TopbarProps): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 md:flex-nowrap md:px-8 md:py-0">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenSidebar}>
          <Menu className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
          {subtitle ? <p className="line-clamp-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {actions}
        </div>
      </div>
    </header>
  );
}


