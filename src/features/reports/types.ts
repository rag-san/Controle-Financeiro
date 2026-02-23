import type { SankeyModel } from "@/src/features/reports/sankey/types";

export type ReportsSankeyNode = {
  name: string;
  kind: "income" | "balance" | "expense";
  color: string;
};

export type ReportsSankeyLink = {
  source: number;
  target: number;
  value: number;
  color: string;
};

export type ReportsPayload = {
  summary: {
    income: number;
    expense: number;
    saved: number;
  };
  sankey: {
    phase: number;
    enabled: boolean;
    message: string;
    nodes: ReportsSankeyNode[];
    links: ReportsSankeyLink[];
  };
};

export type ReportsPeriodPreset = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

export type ReportsPeriodRange = {
  preset: ReportsPeriodPreset;
  label: string;
  start: Date;
  end: Date;
};

export type ReportsPeriodComparison = {
  current: ReportsPeriodRange;
  previous: ReportsPeriodRange;
};

export type ReportsTotals = {
  income: number;
  expense: number;
  net: number;
};

export type ReportsCategorySpend = {
  categoryId: string | null;
  name: string;
  value: number;
  share: number;
  color: string;
  icon: string | null;
};

export type ReportsMerchantSpend = {
  merchantKey: string;
  merchantLabel: string;
  total: number;
  count: number;
};

export type ReportsRecurringDetected = {
  merchantKey: string;
  merchantLabel: string;
  estimatedMonthlyCost: number;
  nextExpectedDate: Date | null;
  occurrences: number;
};

export type ReportsTimeSeriesPoint = {
  key: string;
  label: string;
  from: Date;
  to: Date;
  income: number;
  expense: number;
  net: number;
};

export type ReportPreparedTransaction = {
  id: string;
  date: Date;
  timestamp: number;
  amount: number;
  absAmount: number;
  type: "income" | "expense" | "transfer";
  description: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
  merchantKey: string;
};

export type ReportsModel = {
  currentTotals: ReportsTotals;
  previousTotals: ReportsTotals;
  categorySpending: ReportsCategorySpend[];
  topMerchants: ReportsMerchantSpend[];
  recurringDetected: ReportsRecurringDetected[];
  timeSeries: ReportsTimeSeriesPoint[];
  sankey: SankeyModel;
  hasCurrentData: boolean;
};
