type MigrationSurface =
  | "dashboard"
  | "transactions"
  | "cashflow"
  | "accounts"
  | "netWorth"
  | "recurring"
  | "categories"
  | "reports";

type EnvLike = Record<string, string | undefined>;

const SURFACE_FLAG_KEYS: Record<MigrationSurface, string> = {
  dashboard: "NEXT_PUBLIC_REDESIGN_DASHBOARD",
  transactions: "NEXT_PUBLIC_REDESIGN_TRANSACTIONS",
  cashflow: "NEXT_PUBLIC_REDESIGN_CASHFLOW",
  accounts: "NEXT_PUBLIC_REDESIGN_ACCOUNTS",
  netWorth: "NEXT_PUBLIC_REDESIGN_NET_WORTH",
  recurring: "NEXT_PUBLIC_REDESIGN_RECURRING",
  categories: "NEXT_PUBLIC_REDESIGN_CATEGORIES",
  reports: "NEXT_PUBLIC_REDESIGN_REPORTS"
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function parseBooleanFlag(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

export function isSurfaceRedesignEnabled(
  surface: MigrationSurface,
  env: EnvLike = process.env
): boolean {
  const globalDefault = parseBooleanFlag(env.NEXT_PUBLIC_REDESIGN_ALL);
  const surfaceValue = parseBooleanFlag(env[SURFACE_FLAG_KEYS[surface]]);

  if (surfaceValue !== null) return surfaceValue;
  if (globalDefault !== null) return globalDefault;
  return false;
}

export function getRedesignRollout(env: EnvLike = process.env): Record<MigrationSurface, boolean> {
  return {
    dashboard: isSurfaceRedesignEnabled("dashboard", env),
    transactions: isSurfaceRedesignEnabled("transactions", env),
    cashflow: isSurfaceRedesignEnabled("cashflow", env),
    accounts: isSurfaceRedesignEnabled("accounts", env),
    netWorth: isSurfaceRedesignEnabled("netWorth", env),
    recurring: isSurfaceRedesignEnabled("recurring", env),
    categories: isSurfaceRedesignEnabled("categories", env),
    reports: isSurfaceRedesignEnabled("reports", env)
  };
}
