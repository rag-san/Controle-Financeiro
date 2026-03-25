import type { ViewType } from "@/src/app-shell/types";

export const VIEW_TO_PATH: Record<ViewType, string> = {
  dashboard: "/dashboard",
  transactions: "/transactions",
  cashflow: "/cashflow",
  accounts: "/accounts",
  wealth: "/net-worth",
  recurring: "/recurring",
  categories: "/categories",
  reports: "/reports"
};

export function resolveViewFromPathname(pathname: string): ViewType {
  if (pathname === "/transactions" || pathname.startsWith("/transactions/")) return "transactions";
  if (pathname === "/cashflow" || pathname.startsWith("/cashflow/")) return "cashflow";
  if (pathname === "/accounts" || pathname.startsWith("/accounts/")) return "accounts";
  if (pathname === "/net-worth" || pathname.startsWith("/net-worth/")) return "wealth";
  if (pathname === "/recurring" || pathname.startsWith("/recurring/")) return "recurring";
  if (pathname === "/categories" || pathname.startsWith("/categories/")) return "categories";
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return "reports";
  return "dashboard";
}
