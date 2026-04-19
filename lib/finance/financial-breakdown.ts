import { fromAmountCents } from "@/lib/finance/official-metrics";

export type FinancialAccountType = "checking" | "credit" | "cash" | "investment";

export type FinancialEntryType =
  | "income"
  | "expense"
  | "transfer"
  | "cc_purchase"
  | "cc_payment"
  | "fee"
  | "refund";

export type FinancialEntryLike = {
  id: string;
  postedAt: Date;
  amountCents: number;
  type: FinancialEntryType;
  direction: "IN" | "OUT" | null;
  accountId: string | null;
  accountType: FinancialAccountType | null;
  accountName: string | null;
  creditCardAccountId: string | null;
  creditCardAccountName: string | null;
  categoryId: string | null;
  raw: Record<string, unknown> | null;
  isInternalTransfer: boolean;
};

export type FinancialCardBreakdown = {
  creditCardAccountId: string;
  creditCardName: string;
  spending: number;
  payments: number;
  openDebt: number;
  futureInstallments: number;
  totalCommitted: number;
};

export type FinancialBreakdown = {
  classifiedExpense: number;
  paidExpense: number;
  directCashExpense: number;
  cardSpending: number;
  cardPayments: number;
  internalTransfersOut: number;
  internalTransfersIn: number;
  openCardDebt: number;
  futureInstallments: number;
  futureCommitted: number;
  cards: FinancialCardBreakdown[];
};

type CardAccumulator = {
  creditCardAccountId: string;
  creditCardName: string;
  spendingCents: number;
  paymentsCents: number;
  openDebtCents: number;
  futureInstallmentsCents: number;
};

type InstallmentSnapshot = {
  key: string;
  creditCardAccountId: string;
  creditCardName: string;
  currentInstallment: number;
  remainingInstallments: number;
  postedAt: Date;
  amountCents: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toAmount(cents: number): number {
  return round2(fromAmountCents(cents));
}

function addCents(target: Map<string, CardAccumulator>, input: {
  creditCardAccountId: string;
  creditCardName: string;
  spendingCents?: number;
  paymentsCents?: number;
  openDebtCents?: number;
  futureInstallmentsCents?: number;
}) {
  const current = target.get(input.creditCardAccountId) ?? {
    creditCardAccountId: input.creditCardAccountId,
    creditCardName: input.creditCardName,
    spendingCents: 0,
    paymentsCents: 0,
    openDebtCents: 0,
    futureInstallmentsCents: 0
  };

  current.creditCardName = input.creditCardName || current.creditCardName;
  current.spendingCents += input.spendingCents ?? 0;
  current.paymentsCents += input.paymentsCents ?? 0;
  current.openDebtCents += input.openDebtCents ?? 0;
  current.futureInstallmentsCents += input.futureInstallmentsCents ?? 0;
  target.set(input.creditCardAccountId, current);
}

function isCashAccount(type: FinancialAccountType | null): boolean {
  return type === "checking" || type === "cash";
}

function inCurrentRange(date: Date, from: Date, to: Date): boolean {
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function normalizePositiveCents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(Math.abs(value))) : 0;
}

function readRawInt(raw: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readRawString(raw: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveCardRef(entry: FinancialEntryLike): { id: string; name: string } | null {
  const creditCardAccountId =
    entry.creditCardAccountId?.trim() ||
    (entry.accountType === "credit" ? entry.accountId?.trim() ?? "" : "");

  if (!creditCardAccountId) return null;

  const creditCardName =
    entry.creditCardAccountName?.trim() ||
    (entry.accountType === "credit" ? entry.accountName?.trim() ?? "" : "") ||
    "Cartao";

  return {
    id: creditCardAccountId,
    name: creditCardName
  };
}

function resolveSignedClassifiedExpenseCents(entry: FinancialEntryLike): number {
  if (entry.type === "expense" || entry.type === "cc_purchase" || entry.type === "fee") {
    return entry.amountCents;
  }

  if (entry.type === "refund") {
    return -entry.amountCents;
  }

  return 0;
}

function resolveSignedCardSpendingCents(entry: FinancialEntryLike): number {
  const card = resolveCardRef(entry);
  if (!card) return 0;

  if (entry.type === "cc_purchase" || entry.type === "fee") {
    return entry.amountCents;
  }

  if (entry.type === "refund") {
    return -entry.amountCents;
  }

  return 0;
}

function resolveSignedDirectCashExpenseCents(entry: FinancialEntryLike): number {
  if (!isCashAccount(entry.accountType)) return 0;

  if (entry.type === "expense" || entry.type === "fee") {
    return entry.amountCents;
  }

  if (entry.type === "refund") {
    return -entry.amountCents;
  }

  return 0;
}

function resolveInstallmentSnapshot(entry: FinancialEntryLike): InstallmentSnapshot | null {
  const card = resolveCardRef(entry);
  if (!card) return null;
  if (entry.type !== "cc_purchase" && entry.type !== "fee") return null;

  const currentInstallment = readRawInt(entry.raw, "installmentCurrent");
  const totalInstallments = readRawInt(entry.raw, "installmentTotal");
  const remainingInstallments = readRawInt(entry.raw, "installmentRemaining");
  const baseNormalized =
    readRawString(entry.raw, "installmentBaseNormalizedDescription") ||
    readRawString(entry.raw, "installmentBaseDescription");

  if (
    currentInstallment === null ||
    totalInstallments === null ||
    remainingInstallments === null ||
    !baseNormalized
  ) {
    return null;
  }

  if (
    currentInstallment <= 0 ||
    totalInstallments <= 0 ||
    currentInstallment > totalInstallments ||
    remainingInstallments <= 0
  ) {
    return null;
  }

  return {
    key: `${card.id}|${baseNormalized}|${totalInstallments}|${normalizePositiveCents(entry.amountCents)}`,
    creditCardAccountId: card.id,
    creditCardName: card.name,
    currentInstallment,
    remainingInstallments,
    postedAt: entry.postedAt,
    amountCents: normalizePositiveCents(entry.amountCents)
  };
}

function preferLatestInstallment(left: InstallmentSnapshot, right: InstallmentSnapshot): InstallmentSnapshot {
  if (right.currentInstallment > left.currentInstallment) {
    return right;
  }
  if (right.currentInstallment < left.currentInstallment) {
    return left;
  }
  return right.postedAt.getTime() >= left.postedAt.getTime() ? right : left;
}

export function buildFinancialBreakdown(
  entries: FinancialEntryLike[],
  input: {
    currentFrom: Date;
    currentTo: Date;
    currentCategoryId?: string;
  }
): FinancialBreakdown {
  const cards = new Map<string, CardAccumulator>();
  const latestInstallmentByKey = new Map<string, InstallmentSnapshot>();

  let classifiedExpenseCents = 0;
  let paidExpenseCents = 0;
  let directCashExpenseCents = 0;
  let cardSpendingCents = 0;
  let cardPaymentsCents = 0;
  let internalTransfersOutCents = 0;
  let internalTransfersInCents = 0;

  for (const entry of entries) {
    if (!Number.isFinite(entry.postedAt.getTime())) continue;
    if (entry.postedAt.getTime() > input.currentTo.getTime()) continue;

    const card = resolveCardRef(entry);
    if (card) {
      const signedOpenDebtCents =
        entry.type === "cc_purchase" || entry.type === "fee"
          ? entry.amountCents
          : entry.type === "refund" || entry.type === "cc_payment"
            ? -entry.amountCents
            : 0;

      if (signedOpenDebtCents !== 0) {
        addCents(cards, {
          creditCardAccountId: card.id,
          creditCardName: card.name,
          openDebtCents: signedOpenDebtCents
        });
      }

      const installment = resolveInstallmentSnapshot(entry);
      if (installment) {
        const current = latestInstallmentByKey.get(installment.key);
        latestInstallmentByKey.set(
          installment.key,
          current ? preferLatestInstallment(current, installment) : installment
        );
      }
    }

    const categoryMatches =
      !input.currentCategoryId || (entry.categoryId ?? null) === input.currentCategoryId;

    if (!categoryMatches || !inCurrentRange(entry.postedAt, input.currentFrom, input.currentTo)) {
      continue;
    }

    const signedClassifiedExpenseCents = resolveSignedClassifiedExpenseCents(entry);
    classifiedExpenseCents += signedClassifiedExpenseCents;

    const signedDirectCashExpenseCents = resolveSignedDirectCashExpenseCents(entry);
    directCashExpenseCents += signedDirectCashExpenseCents;
    paidExpenseCents += signedDirectCashExpenseCents;

    const signedCardSpendingCents = resolveSignedCardSpendingCents(entry);
    cardSpendingCents += signedCardSpendingCents;
    if (card && signedCardSpendingCents !== 0) {
      addCents(cards, {
        creditCardAccountId: card.id,
        creditCardName: card.name,
        spendingCents: signedCardSpendingCents
      });
    }

    if (entry.type === "cc_payment") {
      paidExpenseCents += entry.amountCents;
      cardPaymentsCents += entry.amountCents;
      if (card) {
        addCents(cards, {
          creditCardAccountId: card.id,
          creditCardName: card.name,
          paymentsCents: entry.amountCents
        });
      }
    }

    if (entry.type === "transfer" && entry.isInternalTransfer) {
      if (entry.direction === "OUT") {
        internalTransfersOutCents += entry.amountCents;
      } else if (entry.direction === "IN") {
        internalTransfersInCents += entry.amountCents;
      }
    }
  }

  for (const installment of latestInstallmentByKey.values()) {
    addCents(cards, {
      creditCardAccountId: installment.creditCardAccountId,
      creditCardName: installment.creditCardName,
      futureInstallmentsCents: installment.amountCents * installment.remainingInstallments
    });
  }

  const cardRows = [...cards.values()]
    .map((card) => {
      const openDebtCents = Math.max(0, card.openDebtCents);
      const futureInstallmentsCents = Math.max(0, card.futureInstallmentsCents);
      const totalCommittedCents = openDebtCents + futureInstallmentsCents;

      return {
        creditCardAccountId: card.creditCardAccountId,
        creditCardName: card.creditCardName,
        spending: toAmount(card.spendingCents),
        payments: toAmount(card.paymentsCents),
        openDebt: toAmount(openDebtCents),
        futureInstallments: toAmount(futureInstallmentsCents),
        totalCommitted: toAmount(totalCommittedCents)
      } satisfies FinancialCardBreakdown;
    })
    .filter(
      (card) =>
        card.spending !== 0 ||
        card.payments !== 0 ||
        card.openDebt !== 0 ||
        card.futureInstallments !== 0
    )
    .sort((left, right) => {
      if (right.totalCommitted !== left.totalCommitted) {
        return right.totalCommitted - left.totalCommitted;
      }
      return left.creditCardName.localeCompare(right.creditCardName);
    });

  const openCardDebt = cardRows.reduce((sum, card) => sum + card.openDebt, 0);
  const futureInstallments = cardRows.reduce((sum, card) => sum + card.futureInstallments, 0);

  return {
    classifiedExpense: toAmount(classifiedExpenseCents),
    paidExpense: toAmount(paidExpenseCents),
    directCashExpense: toAmount(directCashExpenseCents),
    cardSpending: toAmount(cardSpendingCents),
    cardPayments: toAmount(cardPaymentsCents),
    internalTransfersOut: toAmount(internalTransfersOutCents),
    internalTransfersIn: toAmount(internalTransfersInCents),
    openCardDebt: round2(openCardDebt),
    futureInstallments: round2(futureInstallments),
    futureCommitted: round2(openCardDebt + futureInstallments),
    cards: cardRows
  };
}
