"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type SidebarItemProps = {
  to: string;
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  onNavigate?: () => void;
};

export function SidebarItem({
  to,
  label,
  icon,
  isActive = false,
  onNavigate
}: SidebarItemProps): React.JSX.Element {
  return (
    <Link
      href={to}
      prefetch={false}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive
          ? "bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center",
          isActive
            ? "text-primary"
            : "text-muted-foreground/80 transition-colors group-hover:text-foreground"
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

