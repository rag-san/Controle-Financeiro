import {
  type DashboardDateRange,
  type DashboardMetricsFilters,
  type DashboardSummary
} from "@/lib/server/dashboard-metrics.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { getFinancialBreakdownSnapshot } from "@/lib/server/financial-breakdown.service";
import { getFinancialMetricsSnapshot } from "@/lib/server/financial-metrics.service";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import type { FinancialBreakdown } from "@/lib/finance/financial-breakdown";

type CashBalanceRow = {
  accountId: string;
  accountName: string;
  currency: string;
  amount: number;
};

type CardDebtRow = {
  creditCardAccountId: string;
  creditCardName: string;
  currency: string;
  amount: number;
};

export type DashboardSummaryView = DashboardSummary & {
  cashBalance: CashBalanceRow[];
  totalSpending: number;
  incomeTotal: number;
  cardDebt: CardDebtRow[];
  financeBreakdown: FinancialBreakdown;
  source: "ledger" | "legacy";
};

export async function getDashboardSummaryView(input: {
  userId: string;
  range: DashboardDateRange;
  filters?: DashboardMetricsFilters;
}): Promise<DashboardSummaryView> {
  const [currentMetrics, previousMetrics, ledgerSnapshot, financeBreakdownSnapshot] = await Promise.all([
    getFinancialMetricsSnapshot({
      userId: input.userId,
      from: input.range.fromDate,
      to: input.range.toDate,
      accountId: input.filters?.accountId,
      categoryId: input.filters?.categoryId,
      excluded: input.filters?.excluded ?? false,
      normalizedQuery: input.filters?.normalizedQuery,
      hideCardPaymentMirrorInflow: true
    }),
    getFinancialMetricsSnapshot({
      userId: input.userId,
      from: input.range.previousFromDate,
      to: input.range.previousToDate,
      accountId: input.filters?.accountId,
      categoryId: input.filters?.categoryId,
      excluded: input.filters?.excluded ?? false,
      normalizedQuery: input.filters?.normalizedQuery,
      hideCardPaymentMirrorInflow: true
    }),
    ledgerRepo.getDashboardSummary({
      userId: input.userId,
      to: input.range.toDate
    }),
    getFinancialBreakdownSnapshot({
      userId: input.userId,
      currentFrom: input.range.fromDate,
      currentTo: input.range.toDate,
      accountId: input.filters?.accountId,
      categoryId: input.filters?.categoryId
    })
  ]);
  const currentNet = Number((currentMetrics.budget.net).toFixed(2));
  const previousNet = Number((previousMetrics.budget.net).toFixed(2));
  const delta = Number((currentNet - previousNet).toFixed(2));
  const percent = previousNet === 0 ? (currentNet === 0 ? 0 : 100) : Number((((currentNet - previousNet) / Math.abs(previousNet)) * 100).toFixed(2));
  const summary: DashboardSummary = {
    from: input.range.from,
    to: input.range.to,
    totalIncome: currentMetrics.budget.income,
    totalExpense: currentMetrics.budget.expense,
    net: currentNet,
    cashInflow: currentMetrics.cashFlow.inflow,
    cashOutflow: currentMetrics.cashFlow.outflow,
    cashNet: currentMetrics.cashFlow.net,
    excludedTotal: 0,
    previousPeriodComparison: {
      delta,
      percent,
      previousNet,
      previousIncome: previousMetrics.budget.income,
      previousExpense: previousMetrics.budget.expense,
      previousCashInflow: previousMetrics.cashFlow.inflow,
      previousCashOutflow: previousMetrics.cashFlow.outflow,
      previousCashNet: previousMetrics.cashFlow.net,
      previousExcludedTotal: 0
    }
  };

  const hasLedgerData = ledgerSnapshot.ledgerEntryCount > 0;

  let cashBalance = ledgerSnapshot.cashBalance;
  let cardDebt = ledgerSnapshot.cardDebt;

  if (!hasLedgerData) {
    const accounts = await accountsRepo.listByUserWithBalance(input.userId);
    cashBalance = accounts
      .filter((account) => account.type === "checking" || account.type === "cash")
      .map((account) => ({
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        amount: account.currentBalance ?? 0
      }));
    cardDebt = accounts
      .filter((account) => account.type === "credit")
      .map((account) => ({
        creditCardAccountId: account.id,
        creditCardName: account.name,
        currency: account.currency,
        amount: Math.max(0, Number((-(account.currentBalance ?? 0)).toFixed(2)))
      }));
  }

  return {
    ...summary,
    cashBalance,
    totalSpending: summary.totalExpense,
    incomeTotal: summary.totalIncome,
    cardDebt,
    financeBreakdown: financeBreakdownSnapshot.breakdown,
    source: currentMetrics.source
  };
}
