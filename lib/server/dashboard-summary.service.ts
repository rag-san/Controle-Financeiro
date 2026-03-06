import {
  dashboardMetricsRepo,
  type DashboardDateRange,
  type DashboardMetricsFilters,
  type DashboardSummary
} from "@/lib/server/dashboard-metrics.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { ledgerRepo } from "@/lib/server/ledger.repo";

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
  source: "ledger" | "legacy";
};

export async function getDashboardSummaryView(input: {
  userId: string;
  range: DashboardDateRange;
  filters?: DashboardMetricsFilters;
}): Promise<DashboardSummaryView> {
  const [summary, ledgerSnapshot] = await Promise.all([
    dashboardMetricsRepo.getSummary({
      userId: input.userId,
      range: input.range,
      filters: input.filters
    }),
    ledgerRepo.getDashboardSummary({
      userId: input.userId,
      to: input.range.toDate
    })
  ]);

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
    source: hasLedgerData ? "ledger" : "legacy"
  };
}
