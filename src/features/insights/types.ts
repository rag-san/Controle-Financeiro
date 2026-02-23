import type { CategoryDTO, TransactionDTO } from "@/lib/types";

export type InsightSeverity = "info" | "warning";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  message: string;
  why: string;
  cta?: { label: string; href: string };
  impact?: number;
};

export type PeriodRange = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  query: string;
};

export type PeriodComparison = {
  currentPeriod: PeriodRange;
  previousPeriod: PeriodRange;
};

export type PreparedTransaction = {
  transaction: TransactionDTO;
  id: string;
  date: Date;
  timestamp: number;
  dayOfMonth: number;
  monthKey: string;
  amount: number;
  absAmount: number;
  type: "income" | "expense" | "transfer";
  categoryId: string | null;
  categoryName: string;
  merchantKey: string;
};

export type CategoryAggregate = {
  categoryId: string | null;
  categoryName: string;
  total: number;
  count: number;
};

export type MerchantAggregate = {
  merchantKey: string;
  total: number;
  count: number;
};

export type InsightsBuildInput = {
  transactions: TransactionDTO[];
  categories: CategoryDTO[];
  period: PeriodComparison;
  today?: Date;
};

export type InsightsDetectorContext = {
  categories: CategoryDTO[];
  categoryById: Map<string, CategoryDTO>;
  prepared: PreparedTransaction[];
  currentTransactions: PreparedTransaction[];
  previousTransactions: PreparedTransaction[];
  currentExpenses: PreparedTransaction[];
  previousExpenses: PreparedTransaction[];
  categoryTotalsCurrent: Map<string, CategoryAggregate>;
  categoryTotalsPrevious: Map<string, CategoryAggregate>;
  merchantTotalsCurrent: Map<string, MerchantAggregate>;
  merchantTotalsPrevious: Map<string, MerchantAggregate>;
  period: PeriodComparison;
  today: Date;
};
