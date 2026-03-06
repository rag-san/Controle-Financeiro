"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTheme } from "@/components/layout/ThemeProvider";
import { IconButton } from "@/src/components/ui/IconButton";

type TopbarProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onOpenSidebar?: () => void;
};

export function Topbar({ title, subtitle, actions, onOpenSidebar }: TopbarProps): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const headerActions = (
    <>
      <IconButton
        aria-label="Alternar tema"
        onClick={toggleTheme}
        icon={theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      />
      {actions}
    </>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="px-4 py-3 md:px-6 md:py-3 xl:px-8">
        <div className="flex items-start gap-3">
          <IconButton
            aria-label="Abrir menu lateral"
            onClick={onOpenSidebar}
            icon={<Menu className="h-5 w-5" />}
            className="md:hidden"
          />
          <div className="min-w-0 flex-1">
            <PageHeader title={title} subtitle={subtitle} actions={headerActions} />
          </div>
        </div>
      </div>
    </header>
  );
}


