import {
  buildFinancialBreakdown,
  type FinancialBreakdown,
  type FinancialEntryLike
} from "@/lib/finance/financial-breakdown";
import { assertLedgerCoverageForAnalytics } from "@/lib/server/analytics-source";
import { ledgerRepo } from "@/lib/server/ledger.repo";

type LedgerAnalyticsEntry = Awaited<ReturnType<typeof ledgerRepo.listAnalyticsEntries>>[number];

export type FinancialBreakdownSnapshot = {
  source: "ledger";
  breakdown: FinancialBreakdown;
};

function toLedgerFinancialEntry(entry: LedgerAnalyticsEntry): FinancialEntryLike {
  return {
    id: entry.id,
    postedAt: entry.postedAt,
    amountCents: Math.max(0, Math.abs(entry.amountCents)),
    type: entry.type,
    direction: entry.direction,
    accountId: entry.accountId ?? null,
    accountType: entry.account?.type ?? null,
    accountName: entry.account?.name ?? null,
    creditCardAccountId: entry.creditCardAccountId ?? null,
    creditCardAccountName: entry.creditCardAccount?.name ?? null,
    categoryId: entry.categoryId ?? null,
    raw: entry.raw ?? null,
    isInternalTransfer: entry.type === "transfer"
  };
}

export async function getFinancialBreakdownSnapshot(input: {
  userId: string;
  currentFrom: Date;
  currentTo: Date;
  accountId?: string;
  categoryId?: string;
}): Promise<FinancialBreakdownSnapshot> {
  await assertLedgerCoverageForAnalytics({
    userId: input.userId,
    to: input.currentTo,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: false,
    transactionTypes: ["income", "expense", "transfer"],
    hideCardPaymentMirrorInflow: false
  });

  const entries = await ledgerRepo.listAnalyticsEntries({
    userId: input.userId,
    to: input.currentTo,
    accountId: input.accountId,
    categoryId: input.categoryId
  });

  return {
    source: "ledger",
    breakdown: buildFinancialBreakdown(entries.map(toLedgerFinancialEntry), {
      currentFrom: input.currentFrom,
      currentTo: input.currentTo,
      currentCategoryId: input.categoryId
    })
  };
}

