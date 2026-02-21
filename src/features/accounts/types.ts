import type { AccountDTO } from "@/lib/types";

export type AccountsRangeKey = "1W" | "1M" | "YTD" | "3M" | "1Y" | "ALL";

export type AssetsDebtsPoint = {
  date: string;
  assets: number;
  debts: number;
};

export type HoverPoint = AssetsDebtsPoint | null;

export type NetWorthEntryDTO = {
  id: string;
  type: "asset" | "debt";
  name: string;
  value: number;
  date: string;
  group?: string | null;
};

export type AccountsSummary = {
  assets: number;
  debts: number;
};

export type ConnectionGroup = {
  institution: string;
  accountCount: number;
  accounts: AccountDTO[];
};
