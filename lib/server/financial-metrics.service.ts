import {
  normalizeLedgerFinancialTransaction,
  sumBudgetMetrics,
  sumCashFlowMetrics,
  type FinancialAccountType,
  type NormalizedTransaction
} from "@/lib/finance/normalized-transactions";
import { assertLedgerCoverageForAnalytics } from "@/lib/server/analytics-source";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { ledgerRepo } from "@/lib/server/ledger.repo";

type FinancialMetricsScope = {
  userId: string;
  from?: Date;
  to?: Date;
  accountId?: string;
  accountType?: FinancialAccountType;
  categoryId?: string;
  transactionType?: "income" | "expense" | "transfer";
  excluded?: boolean;
  normalizedQuery?: string;
  hideCardPaymentMirrorInflow?: boolean;
  includeBalanceAdjustments?: boolean;
};

function matchesRequestedTransactionType(
  entry: NormalizedTransaction,
  transactionType: FinancialMetricsScope["transactionType"]
): boolean {
  if (!transactionType) {
    return true;
  }

  if (transactionType === "income") {
    return entry.nature === "income";
  }

  if (transactionType === "expense") {
    return (
      entry.nature === "expense" ||
      entry.nature === "fee" ||
      entry.nature === "loan_payment" ||
      entry.nature === "refund"
    );
  }

  return entry.nature === "internal_transfer" || entry.nature === "credit_card_payment";
}

export async function loadNormalizedTransactionsForScope(
  input: FinancialMetricsScope
): Promise<{
  source: "ledger";
  entries: NormalizedTransaction[];
  scopedAccountType: FinancialAccountType | null;
}> {
  const scopedAccount = input.accountId ? await accountsRepo.findByIdForUser(input.accountId, input.userId) : null;
  const scopedAccountType = scopedAccount?.type ?? null;
  await assertLedgerCoverageForAnalytics({
    userId: input.userId,
    from: input.from,
    to: input.to,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: input.excluded,
    normalizedQuery: input.normalizedQuery,
    transactionTypes: input.transactionType ? [input.transactionType] : ["income", "expense", "transfer"],
    accountTypes: input.accountType ? [input.accountType] : undefined,
    hideCardPaymentMirrorInflow: input.hideCardPaymentMirrorInflow,
    includeBalanceAdjustments: input.includeBalanceAdjustments
  });
  const entries = await ledgerRepo.listAnalyticsEntries({
    userId: input.userId,
    from: input.from,
    to: input.to,
    accountId: input.accountId,
    accountType: input.accountType,
    categoryId: input.categoryId,
    excluded: input.excluded ?? false,
    includeBalanceAdjustments: input.includeBalanceAdjustments ?? false,
    normalizedQuery: input.normalizedQuery,
  });

  return {
    source: "ledger",
    entries: entries
      .map((entry) => normalizeLedgerFinancialTransaction(entry))
      .filter((entry) => matchesRequestedTransactionType(entry, input.transactionType)),
    scopedAccountType
  };
}

export async function getFinancialMetricsSnapshot(
  input: FinancialMetricsScope
): Promise<{
  source: "ledger";
  entries: NormalizedTransaction[];
  budget: {
    income: number;
    expense: number;
    net: number;
  };
  cashFlow: {
    inflow: number;
    outflow: number;
    net: number;
  };
  currentBalance: number;
}> {
  const [{ source, entries, scopedAccountType }, accountsWithBalance] = await Promise.all([
    loadNormalizedTransactionsForScope(input),
    accountsRepo.listByUserWithBalance(input.userId)
  ]);
  const summaryEntries = input.excluded
    ? entries.map((entry) =>
        entry.isBalanceAdjustment
          ? entry
          : {
              ...entry,
              excluded: false
            }
      )
    : entries;

  const filteredAccounts = input.accountId
    ? accountsWithBalance.filter((account) => account.id === input.accountId)
    : accountsWithBalance;
  const currentBalance = Number(
    filteredAccounts
      .filter((account) => account.type === "checking" || account.type === "cash")
      .reduce((sum, account) => sum + (account.currentBalance ?? 0), 0)
      .toFixed(2)
  );

  return {
    source,
    entries,
    budget: sumBudgetMetrics(summaryEntries),
    cashFlow: sumCashFlowMetrics(summaryEntries, {
      scopedAccountId: input.accountId ?? null,
      scopedAccountType
    }),
    currentBalance
  };
}
