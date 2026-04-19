import {
  buildFinancialBreakdown,
  type FinancialBreakdown,
  type FinancialEntryLike
} from "@/lib/finance/financial-breakdown";
import { shouldUseLedgerForAnalytics } from "@/lib/server/analytics-source";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

type LedgerAnalyticsEntry = Awaited<ReturnType<typeof ledgerRepo.listAnalyticsEntries>>[number];
type LegacyTransaction = Awaited<ReturnType<typeof transactionsRepo.listPaged>>[number];
type UserAccount = Awaited<ReturnType<typeof accountsRepo.listByUser>>[number];

export type FinancialBreakdownSnapshot = {
  source: "ledger" | "legacy";
  breakdown: FinancialBreakdown;
};

function normalizeDirection(direction: "in" | "out" | "IN" | "OUT" | null | undefined): "IN" | "OUT" | null {
  if (direction === "in" || direction === "IN") return "IN";
  if (direction === "out" || direction === "OUT") return "OUT";
  return null;
}

function readRawBoolean(raw: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!raw || typeof raw !== "object") return false;
  const value = raw[key];

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  return false;
}

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

function resolveLegacyCreditCardRef(
  transaction: LegacyTransaction,
  accountById: Map<string, UserAccount>
): { id: string | null; name: string | null } {
  if (transaction.account.type === "credit") {
    return {
      id: transaction.accountId,
      name: transaction.account.name
    };
  }

  const targetAccountId = transaction.transferToAccountId?.trim() || null;
  if (targetAccountId) {
    const target = accountById.get(targetAccountId);
    if (target?.type === "credit") {
      return {
        id: target.id,
        name: target.name
      };
    }
  }

  const sourceAccountId = transaction.transferFromAccountId?.trim() || null;
  if (sourceAccountId) {
    const source = accountById.get(sourceAccountId);
    if (source?.type === "credit") {
      return {
        id: source.id,
        name: source.name
      };
    }
  }

  return {
    id: null,
    name: null
  };
}

function toLegacyFinancialEntry(
  transaction: LegacyTransaction,
  accountById: Map<string, UserAccount>
): FinancialEntryLike | null {
  const raw = (transaction.raw as Record<string, unknown> | null) ?? null;
  const direction = normalizeDirection(transaction.direction);
  const isCardPaymentTransfer = readRawBoolean(raw, "transferDetectedFromCardPayment");
  const creditCardRef = resolveLegacyCreditCardRef(transaction, accountById);

  if (transaction.type === "income") {
    return {
      id: transaction.id,
      postedAt: transaction.date,
      amountCents: Math.max(0, Math.round(Math.abs(transaction.amount) * 100)),
      type: transaction.account.type === "credit" ? "refund" : "income",
      direction,
      accountId: transaction.accountId,
      accountType: transaction.account.type,
      accountName: transaction.account.name,
      creditCardAccountId: null,
      creditCardAccountName: null,
      categoryId: transaction.categoryId ?? null,
      raw,
      isInternalTransfer: false
    };
  }

  if (transaction.type === "expense") {
    return {
      id: transaction.id,
      postedAt: transaction.date,
      amountCents: Math.max(0, Math.round(Math.abs(transaction.amount) * 100)),
      type: transaction.account.type === "credit" ? "cc_purchase" : "expense",
      direction,
      accountId: transaction.accountId,
      accountType: transaction.account.type,
      accountName: transaction.account.name,
      creditCardAccountId: null,
      creditCardAccountName: null,
      categoryId: transaction.categoryId ?? null,
      raw,
      isInternalTransfer: false
    };
  }

  if (isCardPaymentTransfer) {
    if (direction === "IN" && transaction.account.type === "credit") {
      return null;
    }

    return {
      id: transaction.id,
      postedAt: transaction.date,
      amountCents: Math.max(0, Math.round(Math.abs(transaction.amount) * 100)),
      type: "cc_payment",
      direction,
      accountId: transaction.accountId,
      accountType: transaction.account.type,
      accountName: transaction.account.name,
      creditCardAccountId: creditCardRef.id,
      creditCardAccountName: creditCardRef.name,
      categoryId: null,
      raw,
      isInternalTransfer: false
    };
  }

  return {
    id: transaction.id,
    postedAt: transaction.date,
    amountCents: Math.max(0, Math.round(Math.abs(transaction.amount) * 100)),
    type: "transfer",
    direction,
    accountId: transaction.accountId,
    accountType: transaction.account.type,
    accountName: transaction.account.name,
    creditCardAccountId: null,
    creditCardAccountName: null,
    categoryId: null,
    raw,
    isInternalTransfer: transaction.isInternalTransfer
  };
}

export async function getFinancialBreakdownSnapshot(input: {
  userId: string;
  currentFrom: Date;
  currentTo: Date;
  accountId?: string;
  categoryId?: string;
}): Promise<FinancialBreakdownSnapshot> {
  const useLedger = await shouldUseLedgerForAnalytics({
    userId: input.userId,
    to: input.currentTo,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: false,
    transactionTypes: ["income", "expense", "transfer"],
    hideCardPaymentMirrorInflow: false
  });

  if (useLedger) {
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

  const [transactions, accounts] = await Promise.all([
    transactionsRepo.listAll({
      userId: input.userId,
      dateTo: input.currentTo,
      accountId: input.accountId,
      categoryId: input.categoryId,
      excluded: false,
      hideCardPaymentMirrorInflow: false
    }),
    accountsRepo.listByUser(input.userId)
  ]);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const entries = transactions
    .map((transaction) => toLegacyFinancialEntry(transaction, accountById))
    .filter((entry): entry is FinancialEntryLike => entry !== null);

  return {
    source: "legacy",
    breakdown: buildFinancialBreakdown(entries, {
      currentFrom: input.currentFrom,
      currentTo: input.currentTo,
      currentCategoryId: input.categoryId
    })
  };
}
