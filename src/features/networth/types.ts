import type { AccountDTO } from "@/lib/types";

export type NetWorthRangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
export type NetWorthTabKey = "assets" | "debts";

export type NetWorthEntryDTO = {
  id: string;
  type: "asset" | "debt";
  name: string;
  value: number;
  date: string;
  group?: string | null;
};

export type NetWorthPoint = {
  date: string;
  assets: number;
  debts: number;
  net: number;
};

export type NetWorthChartPoint = NetWorthPoint & {
  previousNet: number | null;
};

export type AllocationHistoryPoint = {
  date: string;
  value: number;
};

export type AllocationItem = {
  id: string;
  name: string;
  value: number;
  weight: number;
  color: string;
};

export type NetWorthSnapshot = {
  assets: number;
  debts: number;
  net: number;
};

export type DateInterval = {
  start: Date;
  end: Date;
};

export type NetWorthPageData = {
  timeline: NetWorthPoint[];
  currentSeries: NetWorthPoint[];
  currentSnapshot: NetWorthSnapshot;
  previousSnapshot: NetWorthSnapshot;
  assetsAllocation: AllocationItem[];
  debtsAllocation: AllocationItem[];
};

export type AllocationFallbackSource = {
  accounts: AccountDTO[];
};
