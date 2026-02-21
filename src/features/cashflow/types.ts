export type CashflowPeriodKey = "1m" | "3m" | "6m" | "ytd" | "12m";

export type CashflowPeriodOption = {
  value: CashflowPeriodKey;
  label: string;
};

export type DateRange = {
  from: Date;
  to: Date;
};

export type ComparisonMetric = {
  current: number;
  previous: number;
  changePercent: number | null;
};

export type MonthlyAggregate = {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
  net: number;
};

export type NetResultRow = {
  month: string;
  net: number;
  previousNet?: number;
};

export type IncomeRow = {
  month: string;
  income: number;
};

export type ExpensesStackedRow = {
  month: string;
  total: number;
  [category: string]: string | number;
};

export type ExpensesStackedChartData = {
  rows: ExpensesStackedRow[];
  categories: string[];
  legendCategories: string[];
  topN: number;
};

export type CashflowViewData = {
  currentRangeLabel: string;
  previousRangeLabel: string;
  netResult: ComparisonMetric;
  income: ComparisonMetric;
  expense: ComparisonMetric;
  netChart: NetResultRow[];
  incomeChart: IncomeRow[];
  expensesChart: ExpensesStackedChartData;
};
