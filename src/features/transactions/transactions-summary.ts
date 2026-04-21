type TransactionsApiSummary = {
  income?: number;
  expense?: number;
  balance?: number;
  netBudget?: number;
  periodCashInflow?: number;
  periodCashOutflow?: number;
  periodCashFlow?: number;
  cashBalance?: number;
};

export type TransactionsHeaderSummary = {
  income: number;
  expense: number;
  balance: number;
  netBudget: number;
  periodCashInflow: number;
  periodCashOutflow: number;
  periodCashFlow: number;
  cashBalance: number;
};

export function resolveTransactionsHeaderSummary(
  summary: TransactionsApiSummary | null | undefined
): TransactionsHeaderSummary {
  const income = summary?.income ?? 0;
  const expense = summary?.expense ?? 0;
  const balance = summary?.balance ?? 0;
  const netBudget = summary?.netBudget ?? balance;

  // The transactions screen must follow the visible transaction list semantics
  // (budget/result), not cash liquidation, to keep credit card invoices coherent.
  return {
    income,
    expense,
    balance,
    netBudget,
    periodCashInflow: income,
    periodCashOutflow: expense,
    periodCashFlow: balance,
    cashBalance: netBudget
  };
}

