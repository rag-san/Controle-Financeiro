import { normalizeDescription } from "@/lib/normalize";

export type TransactionDirection = "inflow" | "outflow";

export type TransactionNature =
  | "income"
  | "expense"
  | "internal_transfer"
  | "credit_card_payment"
  | "credit_adjustment"
  | "refund"
  | "loan_payment"
  | "fee"
  | "unknown";

export type BudgetImpact = "counts_as_income" | "counts_as_expense" | "ignore_for_budget";

export type FinancialSource = "bank_statement" | "credit_card_statement" | "manual";

export type FinancialAccountType = "checking" | "credit" | "cash" | "investment";

type LegacyAccountLike = {
  id: string;
  name: string;
  type: FinancialAccountType;
  institution?: string | null;
  currency?: string;
  parentAccountId?: string | null;
};

type LegacyFinancialTransactionLike = {
  id: string;
  date: Date;
  description: string;
  normalizedDescription?: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  direction?: "in" | "out";
  categoryId?: string | null;
  category?: {
    name?: string | null;
  } | null;
  raw?: Record<string, unknown> | null;
  excluded?: boolean;
  isInternalTransfer?: boolean;
  accountId: string;
  account: LegacyAccountLike;
  transferFromAccountId?: string | null;
  transferToAccountId?: string | null;
};

type LedgerAccountLike = {
  id: string;
  name: string;
  type: FinancialAccountType;
  institution?: string | null;
  currency?: string;
  parentAccountId?: string | null;
};

type LedgerCreditCardLike = {
  id: string;
  name: string;
  currency?: string;
};

type LedgerFinancialEntryLike = {
  id: string;
  postedAt: Date;
  amount: number;
  amountCents: number;
  type: "income" | "expense" | "transfer" | "cc_purchase" | "cc_payment" | "fee" | "refund";
  direction: "IN" | "OUT" | null;
  descriptionNormalized: string;
  categoryId?: string | null;
  category?: {
    name?: string | null;
  } | null;
  raw?: Record<string, unknown> | null;
  excluded?: boolean;
  isBalanceAdjustment?: boolean;
  accountId?: string | null;
  creditCardAccountId?: string | null;
  account?: LedgerAccountLike | null;
  creditCardAccount?: LedgerCreditCardLike | null;
};

export interface NormalizedTransaction {
  id: string;
  date: string;
  descriptionOriginal: string;
  descriptionNormalized: string;
  amount: number;
  signedAmount: number;
  direction: TransactionDirection;
  nature: TransactionNature;
  budgetImpact: BudgetImpact;
  categoryId?: string | null;
  accountId?: string | null;
  accountType?: FinancialAccountType | null;
  accountName?: string | null;
  source: FinancialSource;
  balanceAfter?: number | null;
  importBatchId?: string | null;
  excluded: boolean;
  isInternalTransfer: boolean;
  isBalanceAdjustment: boolean;
  budgetSignedAmount: number;
  overallCashFlowSignedAmount: number;
  accountBalanceSignedAmount: number;
}

const CARD_PAYMENT_PATTERN =
  /\b(?:PAGAMENTO\s+(?:DA\s+)?FATURA|PGTO\s+(?:DA\s+)?FATURA|PAGTO\s+(?:DA\s+)?FATURA|PAGAMENTO\s+(?:DO\s+)?CARTAO|PGTO\s+CARTAO|PAGTO\s+CARTAO|FATURA\s+CARTAO|PAGAMENTO\s+DE\s+FATURA|CREDIT\s+CARD\s+PAYMENT|PAYMENT\s+OF\s+(?:THE\s+)?CREDIT\s+CARD)\b/;
const CREDIT_ADJUSTMENT_PATTERN =
  /\b(?:CREDITO\s+LIBERADO|PIX\s+NO\s+CREDITO|AJUSTE(?:\s+TECNICO)?|COMPENSACAO(?:\s+TECNICA)?|CREDITO\s+TEMPORARIO|CR[ÉE]DITO\s+TEMPORARIO)\b/;
const REFUND_PATTERN = /\b(?:ESTORNO|REFUND|REVERSAL|DEVOLUCAO|DEVOLUÇÃO|CANCELAMENTO)\b/;
const LOAN_PAYMENT_PATTERN =
  /\b(?:FINANCIAMENTO|EMPRESTIMO|EMPR[EÉ]STIMO|CREDITO\s+PESSOAL|CR[ÉE]DITO\s+PESSOAL)\b/;
const FEE_PATTERN = /\b(?:TARIFA|ANUIDADE|IOF|JUROS|MULTA|ENCARGOS)\b/;
const TRANSFER_CATEGORY_PATTERN = /\b(?:TRANSFERENCIA|TRANSFERENCIAS|TRANSFER|TRANSF)\b/;

function round2(value: number): number {
  return Number(value.toFixed(2));
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

function readRawNumber(raw: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeAmount(value: number): number {
  return round2(Math.abs(value));
}

function normalizeSignedAmount(value: number): number {
  return round2(value);
}

function resolveDirectionFromSignedAmount(value: number): TransactionDirection {
  return value >= 0 ? "inflow" : "outflow";
}

function isCashAccount(type: FinancialAccountType | null | undefined): boolean {
  return type === "checking" || type === "cash";
}

function isTransferCategory(categoryName: string | null | undefined): boolean {
  const normalized = normalizeDescription(categoryName ?? "");
  return TRANSFER_CATEGORY_PATTERN.test(normalized);
}

function resolveBudgetImpact(nature: TransactionNature): BudgetImpact {
  if (nature === "income") return "counts_as_income";
  if (nature === "expense" || nature === "fee" || nature === "loan_payment" || nature === "refund") {
    return "counts_as_expense";
  }
  return "ignore_for_budget";
}

function resolveBudgetSignedAmount(input: {
  nature: TransactionNature;
  signedAmount: number;
  absoluteAmount: number;
}): number {
  if (input.nature === "income") {
    return input.absoluteAmount;
  }
  if (input.nature === "expense" || input.nature === "fee" || input.nature === "loan_payment") {
    return -input.absoluteAmount;
  }
  if (input.nature === "refund") {
    return input.absoluteAmount;
  }
  return 0;
}

function resolveOverallCashFlowSignedAmount(input: {
  nature: TransactionNature;
  signedAmount: number;
  accountType: FinancialAccountType | null | undefined;
  isBalanceAdjustment: boolean;
}): number {
  if (input.isBalanceAdjustment) return 0;
  if (input.nature === "internal_transfer") return 0;
  if (input.nature === "credit_adjustment") return 0;
  if (input.nature === "unknown") return 0;

  if (input.nature === "credit_card_payment") {
    return isCashAccount(input.accountType) ? input.signedAmount : 0;
  }

  if (input.nature === "refund") {
    return isCashAccount(input.accountType) ? Math.abs(input.signedAmount) : 0;
  }

  if (input.nature === "income" || input.nature === "expense" || input.nature === "fee" || input.nature === "loan_payment") {
    return isCashAccount(input.accountType) ? input.signedAmount : 0;
  }

  return 0;
}

function resolveSourceFromLegacy(input: {
  accountType: FinancialAccountType;
  raw: Record<string, unknown> | null | undefined;
}): FinancialSource {
  const rawSourceType = String(input.raw?.sourceType ?? "").trim().toLowerCase();
  const rawDocumentType = String(input.raw?.documentType ?? "").trim().toLowerCase();

  if (rawSourceType === "manual") return "manual";
  if (input.accountType === "credit" || rawDocumentType === "credit_card_invoice") {
    return "credit_card_statement";
  }
  return "bank_statement";
}

function resolveSourceFromLedger(input: {
  accountType: FinancialAccountType | null | undefined;
  entryType: LedgerFinancialEntryLike["type"];
}): FinancialSource {
  if (input.accountType === "credit" || input.entryType === "cc_purchase" || input.entryType === "cc_payment") {
    return "credit_card_statement";
  }
  return "bank_statement";
}

function resolveLegacyNature(input: {
  tx: LegacyFinancialTransactionLike;
  descriptionNormalized: string;
  signedAmount: number;
  absoluteAmount: number;
}): TransactionNature {
  const { tx, descriptionNormalized } = input;
  const raw = tx.raw ?? null;
  const isCardPayment = readRawBoolean(raw, "transferDetectedFromCardPayment") || CARD_PAYMENT_PATTERN.test(descriptionNormalized);

  if (isCardPayment) {
    return "credit_card_payment";
  }

  if (tx.type === "transfer" || tx.isInternalTransfer) {
    return "internal_transfer";
  }

  if (tx.type === "income") {
    if (CREDIT_ADJUSTMENT_PATTERN.test(descriptionNormalized)) {
      return "credit_adjustment";
    }
    if (tx.account.type === "credit" || REFUND_PATTERN.test(descriptionNormalized)) {
      return "refund";
    }
    return "income";
  }

  if (tx.type === "expense") {
    if (FEE_PATTERN.test(descriptionNormalized)) {
      return "fee";
    }
    if (LOAN_PAYMENT_PATTERN.test(descriptionNormalized)) {
      return "loan_payment";
    }
    return "expense";
  }

  return "unknown";
}

function resolveLedgerNature(input: {
  entry: LedgerFinancialEntryLike;
  descriptionNormalized: string;
  signedAmount: number;
}): TransactionNature {
  const { entry, descriptionNormalized } = input;

  if (entry.type === "cc_payment") {
    return "credit_card_payment";
  }
  if (entry.type === "transfer") {
    return "internal_transfer";
  }
  if (entry.type === "refund") {
    return "refund";
  }
  if (entry.type === "fee" || FEE_PATTERN.test(descriptionNormalized)) {
    return "fee";
  }
  if (entry.type === "income") {
    if (CREDIT_ADJUSTMENT_PATTERN.test(descriptionNormalized)) {
      return "credit_adjustment";
    }
    return "income";
  }
  if (entry.type === "expense" || entry.type === "cc_purchase") {
    if (LOAN_PAYMENT_PATTERN.test(descriptionNormalized)) {
      return "loan_payment";
    }
    return "expense";
  }
  return "unknown";
}

function buildNormalizedTransaction(input: {
  id: string;
  date: Date;
  descriptionOriginal: string;
  descriptionNormalized: string;
  absoluteAmount: number;
  signedAmount: number;
  nature: TransactionNature;
  categoryId?: string | null;
  accountId?: string | null;
  accountType?: FinancialAccountType | null;
  accountName?: string | null;
  source: FinancialSource;
  budgetImpactOverride?: BudgetImpact;
  raw?: Record<string, unknown> | null;
  excluded?: boolean;
  isBalanceAdjustment?: boolean;
  isInternalTransfer?: boolean;
}): NormalizedTransaction {
  const isBalanceAdjustment =
    input.isBalanceAdjustment ?? readRawBoolean(input.raw ?? null, "openingBalanceAdjustment");
  const budgetImpact = input.budgetImpactOverride ?? resolveBudgetImpact(input.nature);

  return {
    id: input.id,
    date: input.date.toISOString(),
    descriptionOriginal: input.descriptionOriginal,
    descriptionNormalized: input.descriptionNormalized,
    amount: input.absoluteAmount,
    signedAmount: input.signedAmount,
    direction: resolveDirectionFromSignedAmount(input.signedAmount),
    nature: input.nature,
    budgetImpact,
    categoryId: input.categoryId ?? null,
    accountId: input.accountId ?? null,
    accountType: input.accountType ?? null,
    accountName: input.accountName ?? null,
    source: input.source,
    balanceAfter: readRawNumber(input.raw ?? null, "balanceAfter"),
    importBatchId: null,
    excluded: input.excluded ?? false,
    isInternalTransfer: input.isInternalTransfer ?? input.nature === "internal_transfer",
    isBalanceAdjustment,
    budgetSignedAmount:
      budgetImpact === "ignore_for_budget"
        ? 0
        : resolveBudgetSignedAmount({
            nature: input.nature,
            signedAmount: input.signedAmount,
            absoluteAmount: input.absoluteAmount
          }),
    overallCashFlowSignedAmount: resolveOverallCashFlowSignedAmount({
      nature: input.nature,
      signedAmount: input.signedAmount,
      accountType: input.accountType,
      isBalanceAdjustment
    }),
    accountBalanceSignedAmount: input.signedAmount
  };
}

export function normalizeLegacyFinancialTransaction(
  tx: LegacyFinancialTransactionLike
): NormalizedTransaction {
  const descriptionOriginal = tx.description.trim();
  const descriptionNormalized = tx.normalizedDescription?.trim() || normalizeDescription(descriptionOriginal);
  const signedAmount = normalizeSignedAmount(tx.amount);
  const absoluteAmount = normalizeAmount(tx.amount);
  const nature = resolveLegacyNature({
    tx,
    descriptionNormalized,
    signedAmount,
    absoluteAmount
  });
  const budgetImpactOverride = isTransferCategory(tx.category?.name) ? "ignore_for_budget" : undefined;

  return buildNormalizedTransaction({
    id: tx.id,
    date: tx.date,
    descriptionOriginal,
    descriptionNormalized,
    absoluteAmount,
    signedAmount,
    nature,
    categoryId: tx.categoryId ?? null,
    accountId: tx.accountId,
    accountType: tx.account.type,
    accountName: tx.account.name,
    source: resolveSourceFromLegacy({
      accountType: tx.account.type,
      raw: tx.raw ?? null
    }),
    budgetImpactOverride,
    raw: tx.raw ?? null,
    excluded: tx.excluded ?? false,
    isBalanceAdjustment: readRawBoolean(tx.raw ?? null, "openingBalanceAdjustment"),
    isInternalTransfer: tx.isInternalTransfer ?? tx.type === "transfer"
  });
}

function resolveLedgerSignedAmount(entry: LedgerFinancialEntryLike): number {
  if (entry.type === "refund") {
    if (entry.account?.type === "credit" || entry.creditCardAccountId) {
      return Math.abs(entry.amount);
    }
    return Math.abs(entry.amount);
  }

  if (entry.type === "cc_payment") {
    return entry.direction === "IN" ? Math.abs(entry.amount) : -Math.abs(entry.amount);
  }

  if (entry.type === "transfer") {
    return entry.direction === "IN" ? Math.abs(entry.amount) : -Math.abs(entry.amount);
  }

  if (entry.type === "income") {
    return Math.abs(entry.amount);
  }

  return -Math.abs(entry.amount);
}

function resolveLedgerAccountContext(entry: LedgerFinancialEntryLike): {
  accountId: string | null;
  accountType: FinancialAccountType | null;
  accountName: string | null;
  raw: Record<string, unknown> | null;
} {
  if (entry.accountId && entry.account) {
    return {
      accountId: entry.accountId,
      accountType: entry.account.type,
      accountName: entry.account.name,
      raw: entry.raw ?? null
    };
  }

  if (entry.creditCardAccountId && entry.creditCardAccount) {
    return {
      accountId: entry.creditCardAccountId,
      accountType: "credit",
      accountName: entry.creditCardAccount.name,
      raw: entry.raw ?? null
    };
  }

  return {
    accountId: entry.accountId ?? entry.creditCardAccountId ?? null,
    accountType: entry.account?.type ?? (entry.creditCardAccountId ? "credit" : null),
    accountName: entry.account?.name ?? entry.creditCardAccount?.name ?? null,
    raw: entry.raw ?? null
  };
}

export function normalizeLedgerFinancialTransaction(
  entry: LedgerFinancialEntryLike
): NormalizedTransaction {
  const descriptionNormalized = entry.descriptionNormalized.trim() || "SEM DESCRICAO";
  const signedAmount = resolveLedgerSignedAmount(entry);
  const absoluteAmount = normalizeAmount(entry.amount);
  const accountContext = resolveLedgerAccountContext(entry);
  const nature = resolveLedgerNature({
    entry,
    descriptionNormalized,
    signedAmount
  });
  const budgetImpactOverride = isTransferCategory(entry.category?.name) ? "ignore_for_budget" : undefined;
  const normalized = buildNormalizedTransaction({
    id: entry.id,
    date: entry.postedAt,
    descriptionOriginal: descriptionNormalized,
    descriptionNormalized,
    absoluteAmount,
    signedAmount,
    nature,
    categoryId: entry.categoryId ?? null,
    accountId: accountContext.accountId,
    accountType: accountContext.accountType,
    accountName: accountContext.accountName,
    source: resolveSourceFromLedger({
      accountType: accountContext.accountType,
      entryType: entry.type
    }),
    budgetImpactOverride,
    raw: accountContext.raw,
    excluded: entry.excluded ?? false,
    isBalanceAdjustment: entry.isBalanceAdjustment ?? false,
    isInternalTransfer: entry.type === "transfer"
  });

  if (entry.type === "cc_purchase" || entry.type === "cc_payment" || entry.type === "refund") {
    if (accountContext.accountType === "credit") {
      normalized.accountBalanceSignedAmount = signedAmount;
    } else if (!isCashAccount(accountContext.accountType)) {
      normalized.accountBalanceSignedAmount = 0;
    }
  }

  return normalized;
}

export function sumBudgetMetrics(entries: NormalizedTransaction[]): {
  income: number;
  expense: number;
  net: number;
} {
  let income = 0;
  let expense = 0;

  for (const entry of entries) {
    if (entry.excluded || entry.isBalanceAdjustment) continue;

    if (entry.budgetImpact === "counts_as_income") {
      income += entry.budgetSignedAmount;
      continue;
    }

    if (entry.budgetImpact === "counts_as_expense") {
      expense += -entry.budgetSignedAmount;
    }
  }

  return {
    income: round2(income),
    expense: round2(expense),
    net: round2(income - expense)
  };
}

export function sumCashFlowMetrics(
  entries: NormalizedTransaction[],
  options?: { scopedAccountId?: string | null; scopedAccountType?: FinancialAccountType | null }
): {
  inflow: number;
  outflow: number;
  net: number;
} {
  let inflow = 0;
  let outflow = 0;

  for (const entry of entries) {
    if (entry.excluded && !entry.isBalanceAdjustment) continue;

    const signedAmount =
      options?.scopedAccountId && entry.accountId === options.scopedAccountId && isCashAccount(options.scopedAccountType)
        ? entry.accountBalanceSignedAmount
        : options?.scopedAccountId
          ? 0
          : entry.overallCashFlowSignedAmount;

    if (signedAmount > 0) {
      inflow += signedAmount;
    } else if (signedAmount < 0) {
      outflow += Math.abs(signedAmount);
    }
  }

  return {
    inflow: round2(inflow),
    outflow: round2(outflow),
    net: round2(inflow - outflow)
  };
}
