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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center",
          isActive
            ? "text-blue-600 dark:text-blue-300"
            : "text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

