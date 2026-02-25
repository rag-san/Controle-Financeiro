import type { AccountDTO } from "@/lib/types";
import { normalizeDateKey } from "@/src/features/shared/utils/dateKey";
import type {
  AllocationFallbackSource,
  AllocationHistoryPoint,
  AllocationItem,
  NetWorthEntryDTO
} from "@/src/features/networth/types";

type AllocationRow = {
  name: string;
  value: number;
  type: "asset" | "debt";
};

type AllocationBreakdownItem = {
  id: string;
  label: string;
  value: number;
};

const paletteBySemanticGroup: Record<string, string> = {
  Caixa: "#68b57d",
  "Renda Fixa": "#5b7ddb",
  "Renda Variável": "#7bbf7a",
  Dívidas: "#f08c45",
  Outros: "#94a3b8"
};

const fallbackPalette = [
  "#4f86e3",
  "#53b58a",
  "#5cc5df",
  "#7c6ce0",
  "#4da4b3",
  "#8a77d4",
  "#46a2f3",
  "#53a97c"
] as const;

function toSafeCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function normalizeAllocationGroupName(rawName: string | null | undefined): string {
  const normalized = (rawName ?? "").trim().toLowerCase();

  if (!normalized) {
    return "Outros";
  }

  if (normalized.includes("caixa") || normalized.includes("cash")) {
    return "Caixa";
  }

  if (
    normalized.includes("renda fixa") ||
    normalized.includes("fixed") ||
    normalized.includes("fixa")
  ) {
    return "Renda Fixa";
  }

  if (
    normalized.includes("renda vari") ||
    normalized.includes("variavel") ||
    normalized.includes("equity")
  ) {
    return "Renda Variável";
  }

  return rawName?.trim() || "Outros";
}

function resolveFallbackGroupFromAccount(account: AccountDTO): string {
  if (account.type === "investment") {
    return "Renda Fixa";
  }

  if (account.type === "checking" || account.type === "cash") {
    return "Caixa";
  }

  return "Renda Variável";
}

function resolveAllocationColor(name: string, type: "asset" | "debt"): string {
  if (type === "debt") {
    return paletteBySemanticGroup.Dívidas;
  }

  const semanticColor = paletteBySemanticGroup[name];
  if (semanticColor) {
    return semanticColor;
  }

  const paletteIndex = hashString(name.toLowerCase()) % fallbackPalette.length;
  return fallbackPalette[paletteIndex];
}

function buildFallbackRowsFromAccounts(
  source: AllocationFallbackSource,
  type: "asset" | "debt"
): AllocationRow[] {
  const rows: AllocationRow[] = [];

  for (const account of source.accounts) {
    const balance = account.currentBalance ?? 0;

    if (type === "asset" && balance > 0) {
      rows.push({
        name: resolveFallbackGroupFromAccount(account),
        value: balance,
        type
      });
    }

    if (type === "debt" && balance < 0) {
      rows.push({
        name: "Dívidas",
        value: Math.abs(balance),
        type
      });
    }
  }

  return rows;
}

function aggregateRows(rows: AllocationRow[]): AllocationItem[] {
  const grouped = new Map<string, AllocationRow>();

  for (const row of rows) {
    const previous = grouped.get(row.name);
    if (!previous) {
      grouped.set(row.name, { ...row, value: row.value });
      continue;
    }

    grouped.set(row.name, {
      ...previous,
      value: previous.value + row.value
    });
  }

  const total = [...grouped.values()].reduce((accumulator, item) => accumulator + item.value, 0);

  return [...grouped.entries()]
    .map(([name, item]) => ({
      id: `${item.type}-${name}`,
      name,
      value: toSafeCurrency(item.value),
      weight: total > 0 ? Number(((item.value / total) * 100).toFixed(2)) : 0,
      color: resolveAllocationColor(name, item.type)
    }))
    .sort((left, right) => right.value - left.value);
}

function buildFallbackBreakdownFromAccounts(
  source: AllocationFallbackSource,
  type: "asset" | "debt",
  groupName: string
): AllocationBreakdownItem[] {
  const rows: AllocationBreakdownItem[] = [];

  for (const account of source.accounts) {
    const balance = account.currentBalance ?? 0;

    if (type === "asset" && balance > 0) {
      const accountGroup = resolveFallbackGroupFromAccount(account);
      if (accountGroup !== groupName) {
        continue;
      }

      rows.push({
        id: account.id,
        label: account.name,
        value: toSafeCurrency(balance)
      });
    }

    if (type === "debt" && balance < 0 && groupName === "Dívidas") {
      rows.push({
        id: account.id,
        label: account.name,
        value: toSafeCurrency(Math.abs(balance))
      });
    }
  }

  return rows.sort((left, right) => right.value - left.value);
}

export function calculateAllocationItems(
  entries: NetWorthEntryDTO[],
  latestDateKey: string | null,
  type: "asset" | "debt",
  fallback: AllocationFallbackSource
): AllocationItem[] {
  const rowsFromEntries = latestDateKey
    ? entries
        .filter((entry) => normalizeDateKey(entry.date) === latestDateKey && entry.type === type)
        .map<AllocationRow>((entry) => ({
          name: normalizeAllocationGroupName(entry.group || entry.name),
          value: type === "debt" ? Math.abs(entry.value) : Math.max(0, entry.value),
          type
        }))
    : [];

  const sourceRows = rowsFromEntries.length > 0 ? rowsFromEntries : buildFallbackRowsFromAccounts(fallback, type);

  return aggregateRows(sourceRows);
}

export function buildAllocationHistory(
  entries: NetWorthEntryDTO[],
  type: "asset" | "debt",
  itemName: string
): AllocationHistoryPoint[] {
  const groupedByDate = new Map<string, number>();

  for (const entry of entries) {
    if (entry.type !== type) continue;
    const normalizedGroup = normalizeAllocationGroupName(entry.group || entry.name);
    if (normalizedGroup !== itemName) continue;

    const dateKey = normalizeDateKey(entry.date);
    const previousValue = groupedByDate.get(dateKey) ?? 0;
    const normalizedValue = type === "debt" ? Math.abs(entry.value) : Math.max(0, entry.value);
    groupedByDate.set(dateKey, previousValue + normalizedValue);
  }

  return [...groupedByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({
      date,
      value: toSafeCurrency(value)
    }));
}

export function buildAllocationBreakdownItems(
  entries: NetWorthEntryDTO[],
  latestDateKey: string | null,
  type: "asset" | "debt",
  groupName: string,
  fallback: AllocationFallbackSource
): AllocationBreakdownItem[] {
  if (!latestDateKey) {
    return buildFallbackBreakdownFromAccounts(fallback, type, groupName);
  }

  const groupedByName = new Map<string, number>();

  for (const entry of entries) {
    if (entry.type !== type) continue;
    if (normalizeDateKey(entry.date) !== latestDateKey) continue;

    const normalizedGroup = normalizeAllocationGroupName(entry.group || entry.name);
    if (normalizedGroup !== groupName) continue;

    const normalizedName = entry.name?.trim() || normalizedGroup;
    const previous = groupedByName.get(normalizedName) ?? 0;
    const normalizedValue = type === "debt" ? Math.abs(entry.value) : Math.max(0, entry.value);
    groupedByName.set(normalizedName, previous + normalizedValue);
  }

  if (groupedByName.size === 0) {
    return buildFallbackBreakdownFromAccounts(fallback, type, groupName);
  }

  return [...groupedByName.entries()]
    .map(([label, value]) => ({
      id: `${type}-${groupName}-${label}`,
      label,
      value: toSafeCurrency(value)
    }))
    .sort((left, right) => right.value - left.value);
}
