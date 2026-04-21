import { z } from "zod";
import { db } from "@/lib/db";
import { createImportedHash, createTransferKeyHash } from "@/lib/hash";
import { reconcileAccountStatement } from "@/lib/finance/statement-reconciliation";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { extractInstallmentInfo } from "@/lib/installments";
import { parseStrictMoneyInput } from "@/lib/money";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { accountsRepo } from "@/lib/server/accounts.repo";
import {
  categorizeCanonicalImportRowWithContext,
  loadImportAutocategorizationContext
} from "@/lib/server/import-autocategorization.service";
import { importsRepo } from "@/lib/server/imports.repo";
import { getReconciliationInboxForUser } from "@/lib/server/ledger.service";
import { syncLedgerForLegacyTransactions, syncLedgerFromImportBatch } from "@/lib/server/ledger-sync.service";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export const MAX_IMPORT_COMMIT_ROWS = 5000;

const CARD_PAYMENT_STATEMENT_PATTERN =
  /\b(?:PAGAMENTO\s+(?:DA\s+)?FATURA|PGTO\s+(?:DA\s+)?FATURA|PAGTO\s+(?:DA\s+)?FATURA|PAGAMENTO\s+(?:DO\s+)?CARTAO|PGTO\s+CARTAO|PAGTO\s+CARTAO|FATURA\s+CARTAO|PAGAMENTO\s+DE\s+FATURA|CREDIT\s+CARD\s+PAYMENT|PAYMENT\s+OF\s+(?:THE\s+)?CREDIT\s+CARD|FATURA)\b/i;
const CARD_PAYMENT_INVOICE_SKIP_PATTERN =
  /\b(?:PAGAMENTO\s+RECEBIDO|CREDITO\s+DE\s+PAGAMENTO|PAYMENT\s+RECEIVED|CARD\s+PAYMENT\s+CREDIT|PAGAMENTO\s+ON(?:\s*|-)?LINE|PAGTO\s+ON(?:\s*|-)?LINE|PGTO\s+ON(?:\s*|-)?LINE)\b/i;
const CARD_PAYMENT_GENERIC_PATTERN = /\b(?:PAGAMENTO|PAGTO|PGTO)\b/i;
const CARD_PAYMENT_REFUND_OR_CREDIT_PATTERN =
  /\b(?:ESTORNO|REFUND|REVERSAL|AJUSTE|CREDITO|CR[ÉE]DITO|CASHBACK)\b/i;
const INTERNAL_TRANSFER_KEYWORD_PATTERN = /\b(?:PIX|TED|DOC|TRANSFERENCIA|TRANSFER)\b/i;
const INTERNAL_TRANSFER_DESCRIPTION_HINT_PATTERN = /\b(?:PIX|TED|DOC|TRANSFERENCIA|TRANSFER|ENVIO|RECEBIDO)\b/i;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_TRANSFER_MAX_DATE_DIFF_MS = ONE_DAY_MS;
const INTERNAL_TRANSFER_SCORE_WEIGHTS = {
  amount: 0.5,
  date: 0.3,
  description: 0.2
} as const;
const INTERNAL_TRANSFER_MIN_DESCRIPTION_SCORE = 0.35;
const INTERNAL_TRANSFER_MIN_TOTAL_SCORE = 0.75;
const INTERNAL_TRANSFER_REVIEW_MIN_TOTAL_SCORE = 0.55;
const MAX_TRANSFER_REVIEW_SUGGESTIONS = 20;
const MIN_OPENING_BALANCE_ADJUSTMENT = 0.01;
const INVOICE_RECONCILIATION_TOLERANCE = 0.05;
const OPENING_BALANCE_EXTERNAL_ID_PREFIX = "OPENING_BALANCE";
const OPENING_BALANCE_DESCRIPTION_PREFIX = "Saldo inicial importado";

const INTERNAL_TRANSFER_STOPWORDS = new Set([
  "PIX",
  "TED",
  "DOC",
  "TRANSFERENCIA",
  "TRANSFER",
  "TRANSF",
  "ENTRE",
  "CONTA",
  "CONTAS",
  "PARA",
  "DE",
  "DA",
  "DO",
  "NO",
  "NA",
  "EM",
  "ENVIO",
  "ENVIADO",
  "RECEBIDO",
  "RECEBIDA"
]);

export const importCommitPayloadSchema = z.object({
  sourceType: z.enum(["csv", "ofx", "pdf", "manual"]),
  fileName: z.string().min(1).max(255),
  defaultAccountId: z.string().min(6).max(128).optional(),
  mapping: z.record(z.unknown()).optional(),
  applyRules: z.boolean().optional().default(true),
  applyLocalAi: z.boolean().optional().default(false),
  rows: z.array(
    z.object({
      date: z.union([z.string(), z.date()]),
      description: z.string(),
      amount: z.number(),
      type: z.enum(["income", "expense", "transfer"]).optional(),
      balanceAfter: z.number().optional().nullable(),
      transactionKindRaw: z.string().optional(),
      counterpartyRaw: z.string().optional(),
      transactionKindNorm: z.string().optional(),
      counterpartyNorm: z.string().optional(),
      merchantKey: z.string().optional(),
      sourceType: z.enum(["csv", "ofx", "pdf", "manual"]).optional(),
      documentType: z.string().optional().nullable(),
      accountId: z.string().min(6).max(128).optional(),
      accountHint: z.string().optional(),
      categoryId: z.string().min(6).max(128).nullable().optional(),
      transferToAccountId: z.string().min(6).max(128).optional(),
      transferFromAccountId: z.string().min(6).max(128).optional(),
      externalId: z.string().optional(),
      raw: z.record(z.unknown()).optional()
    })
  ).max(MAX_IMPORT_COMMIT_ROWS)
});

type ImportCommitPayload = z.infer<typeof importCommitPayloadSchema>;
type ImportRowInput = ImportCommitPayload["rows"][number];
type UserAccount = Awaited<ReturnType<typeof accountsRepo.listByUser>>[number];

async function listUnmirroredImportBatchTransactionIds(input: {
  userId: string;
  importBatchId: string;
  limit?: number;
}): Promise<string[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 5000, 20000));

  const rows = (await db
    .prepare(
      `SELECT t.id
       FROM transactions t
       JOIN accounts a
         ON a.id = t.account_id
        AND a.user_id = t.user_id
       LEFT JOIN ledger_entries le
         ON le.user_id = t.user_id
        AND le.external_ref = ('LEGACY_TX:' || t.id)
       WHERE t.user_id = ?
         AND t.import_batch_id = ?
         AND le.id IS NULL
         AND NOT (
           t.type = 'transfer'::transaction_type
           AND t.direction = 'in'::transaction_direction
           AND t.is_internal_transfer = TRUE
           AND a.type = 'credit'
           AND t.transfer_to_account_id = t.account_id
           AND t.raw_json IS NOT NULL
           AND t.raw_json LIKE '%"transferDetectedFromCardPayment":true%'
         )
       ORDER BY t.posted_at ASC, t.created_at ASC
       LIMIT ?`
    )
    .all(input.userId, input.importBatchId, limit)) as Array<{ id: string }>;

  return rows.map((row) => row.id);
}

export class ImportCommitError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ImportCommitError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const IMPORT_INSTITUTION_RULES: Array<{ institution: string; patterns: string[] }> = [
  {
    institution: "Mercado Pago",
    patterns: ["MERCADO PAGO", "MERCADOPAGO", "MELI", "DINHEIRO RESERVADO", "MUSD"]
  },
  {
    institution: "Inter",
    patterns: ["BANCO INTER", "INTER", "FATURA CARTAO INTER", "CARTAO INTER"]
  },
  {
    institution: "Nubank",
    patterns: ["NUBANK", "NU PAGAMENTOS"]
  },
  {
    institution: "PagBank",
    patterns: ["PAGBANK", "PAGSEGURO"]
  },
  {
    institution: "Santander",
    patterns: ["SANTANDER"]
  },
  {
    institution: "Itau",
    patterns: ["ITAU", "ITAUUNIBANCO"]
  }
];

function readRawString(raw: Record<string, unknown> | undefined, key: string): string | null {
  const value = raw?.[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRawBoolean(raw: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const value = raw[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  return false;
}

function looksLikeBareAccountIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  const compact = value.replace(/\s+/g, "");
  return /^[0-9.\-\/]+$/.test(compact);
}

function sanitizeAccountName(value: string | null | undefined): string | null {
  if (!value) return null;
  const sanitized = value.replace(/\s+/g, " ").trim();
  return sanitized.length > 0 ? sanitized : null;
}

function detectImportInstitutionHint(values: Array<string | null | undefined>): string | null {
  const normalized = normalizeDescription(values.filter(Boolean).join(" "));
  if (!normalized) {
    return null;
  }

  for (const rule of IMPORT_INSTITUTION_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule.institution;
    }
  }

  return null;
}

function resolveCreditInstitutionHint(input: {
  row: ImportRowInput;
  fallbackInstitution?: string | null;
  fileName?: string | null;
}): string | null {
  return detectImportInstitutionHint([
    readRawString(input.row.raw, "importInstitutionHint"),
    readRawString(input.row.raw, "issuerProfile"),
    input.row.accountHint,
    input.row.description,
    input.fileName,
    input.fallbackInstitution
  ]);
}

function normalizeInstitutionValue(value: string | null | undefined): string {
  return normalizeDescription(value ?? "");
}

function filterCreditAccountsByInstitution(
  accounts: UserAccount[],
  institutionHint: string | null
): UserAccount[] {
  if (!institutionHint) {
    return accounts;
  }

  const normalizedHint = normalizeInstitutionValue(institutionHint);
  if (!normalizedHint) {
    return accounts;
  }

  return accounts.filter((account) => {
    const normalizedInstitution = normalizeInstitutionValue(account.institution);
    const normalizedName = normalizeDescription(account.name);

    return (
      (normalizedInstitution.length > 0 &&
        (normalizedInstitution === normalizedHint ||
          normalizedInstitution.includes(normalizedHint) ||
          normalizedHint.includes(normalizedInstitution))) ||
      (normalizedName.length > 0 &&
        (normalizedName.includes(normalizedHint) || normalizedHint.includes(normalizedName)))
    );
  });
}

function buildAutoCreditAccountCacheKey(input: {
  parentAccountId: string;
  institutionHint: string | null;
  fallbackName: string;
}): string {
  const normalizedHint = normalizeDescription(input.institutionHint ?? input.fallbackName);
  return `${input.parentAccountId}|${normalizedHint}`;
}

function accountLabelFromImportRow(row: ImportRowInput): string {
  const rawLabel = sanitizeAccountName(readRawString(row.raw, "importAccountLabel"));
  if (rawLabel) {
    return rawLabel;
  }

  if (isCreditCardInvoiceDocumentType(row.documentType)) {
    return "Cartao";
  }

  return "Conta";
}

function inferImportedAccountDraft(input: {
  row: ImportRowInput;
  sourceType: ImportCommitPayload["sourceType"];
  fileName: string;
}): {
  name: string | null;
  type: UserAccount["type"];
  institution: string | null;
} {
  const rawHint = sanitizeAccountName(readRawString(input.row.raw, "importAccountHint"));
  const accountHint = sanitizeAccountName(input.row.accountHint) ?? rawHint;
  const accountIdentifier = sanitizeAccountName(readRawString(input.row.raw, "importAccountIdentifier"));
  const accountLabel = accountLabelFromImportRow(input.row);
  const institution = detectImportInstitutionHint([
    readRawString(input.row.raw, "importInstitutionHint"),
    readRawString(input.row.raw, "issuerProfile"),
    accountHint,
    input.fileName
  ]);
  const type: UserAccount["type"] = isCreditCardInvoiceDocumentType(input.row.documentType) ? "credit" : "checking";

  if (accountHint && !looksLikeBareAccountIdentifier(accountHint)) {
    return {
      name: accountHint,
      type,
      institution
    };
  }

  const identifier = accountIdentifier ?? (looksLikeBareAccountIdentifier(accountHint) ? accountHint : null);
  if (identifier && institution) {
    return {
      name: `${accountLabel} ${institution} ${identifier}`.trim(),
      type,
      institution
    };
  }

  if (identifier) {
    return {
      name: `${accountLabel} ${identifier}`.trim(),
      type,
      institution
    };
  }

  if (institution) {
    return {
      name: `${accountLabel} ${institution}`.trim(),
      type,
      institution
    };
  }

  return {
    name: null,
    type,
    institution: null
  };
}

function parseBooleanMappingValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "sim"].includes(normalized)) return true;
    if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  }
  return fallback;
}

function parseStringMappingValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveMappingOptions(mapping?: Record<string, unknown>): {
  skipCardPaymentLines: boolean;
  convertCardPaymentsToTransfer: boolean;
  cardPaymentTargetAccountId: string | null;
} {
  const options = mapping ?? {};

  return {
    skipCardPaymentLines: parseBooleanMappingValue(options.skipCardPaymentLines, true),
    convertCardPaymentsToTransfer: parseBooleanMappingValue(options.convertCardPaymentsToTransfer, true),
    cardPaymentTargetAccountId: parseStringMappingValue(options.cardPaymentTargetAccountId)
  };
}

function isCheckingLikeAccount(accountType: UserAccount["type"]): boolean {
  return accountType === "checking" || accountType === "cash";
}

function shouldDetectCardPaymentFromStatement(input: {
  accountType: UserAccount["type"];
  normalizedDescription: string;
}): boolean {
  const hasFatura = input.normalizedDescription.includes("FATURA");
  const hasPaymentHint = /\b(?:PAGAMENTO|PAGTO|PGTO|PAG)\b/.test(input.normalizedDescription);
  const hasCardHint = /\bCART[A-Z]*\b/.test(input.normalizedDescription);

  return (
    isCheckingLikeAccount(input.accountType) &&
    (CARD_PAYMENT_STATEMENT_PATTERN.test(input.normalizedDescription) ||
      (hasFatura && (hasPaymentHint || hasCardHint)))
  );
}

function shouldSkipCardPaymentOnCreditImport(input: {
  accountType: UserAccount["type"];
  normalizedDescription: string;
  amount: number;
  skipCardPaymentLines: boolean;
}): boolean {
  if (!input.skipCardPaymentLines || input.accountType !== "credit") {
    return false;
  }

  // Em faturas de cartão, pagamento costuma vir como crédito/entrada.
  if (input.amount < 0) {
    return false;
  }

  if (CARD_PAYMENT_INVOICE_SKIP_PATTERN.test(input.normalizedDescription)) {
    return true;
  }

  if (
    input.amount > 0 &&
    CARD_PAYMENT_GENERIC_PATTERN.test(input.normalizedDescription) &&
    !CARD_PAYMENT_REFUND_OR_CREDIT_PATTERN.test(input.normalizedDescription)
  ) {
    return true;
  }

  // Fallback para linhas positivas típicas de "pagamento online" em fatura.
  if (
    input.amount > 0 &&
    /\b(?:PAGAMENTO|PAGTO|PGTO)\b/.test(input.normalizedDescription) &&
    /\bON(?:\s*|-)?LINE\b/.test(input.normalizedDescription)
  ) {
    return true;
  }

  return false;
}

function resolveCardPaymentTargetAccountId(input: {
  row: ImportRowInput;
  fromAccount: UserAccount;
  accounts: UserAccount[];
  accountById: Map<string, UserAccount>;
  mappingCardPaymentTargetAccountId: string | null;
}): string | null {
  const institutionHint = resolveCreditInstitutionHint({
    row: input.row,
    fallbackInstitution: input.fromAccount.institution ?? null
  });
  const explicitCandidates = [input.row.transferToAccountId, input.mappingCardPaymentTargetAccountId]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const accountId of explicitCandidates) {
    const account = input.accountById.get(accountId);
    if (account?.type === "credit") {
      return account.id;
    }
  }

  const children = filterCreditAccountsByInstitution(
    input.accounts.filter((account) => account.type === "credit" && account.parentAccountId === input.fromAccount.id),
    institutionHint
  );
  if (children.length === 1) {
    return children[0].id;
  }

  if (!institutionHint) {
    return null;
  }

  const sameInstitutionCards = filterCreditAccountsByInstitution(
    input.accounts.filter((account) => account.type === "credit" && account.id !== input.fromAccount.id),
    institutionHint
  );

  if (sameInstitutionCards.length === 1) {
    return sameInstitutionCards[0].id;
  }

  return null;
}

function isCreditCardInvoiceDocumentType(documentType: string | null | undefined): boolean {
  const normalized = String(documentType ?? "").trim().toLowerCase();
  return normalized === "credit_card_invoice" || normalized === "credit card invoice";
}

function resolveCreditInvoiceAccountId(input: {
  row: ImportRowInput;
  currentAccount: UserAccount;
  accounts: UserAccount[];
  accountById: Map<string, UserAccount>;
  defaultAccountId?: string;
}): string | null {
  const explicitAccountId = input.row.accountId?.trim();
  if (explicitAccountId) {
    const explicitAccount = input.accountById.get(explicitAccountId);
    if (explicitAccount?.type === "credit") {
      return explicitAccount.id;
    }
  }

  const defaultAccount = input.defaultAccountId ? input.accountById.get(input.defaultAccountId) : null;
  if (defaultAccount?.type === "credit") {
    return defaultAccount.id;
  }

  const creditAccounts = input.accounts.filter((account) => account.type === "credit");
  if (creditAccounts.length === 0) {
    return null;
  }
  const institutionHint = resolveCreditInstitutionHint({
    row: input.row,
    fallbackInstitution: input.currentAccount.institution ?? null
  });

  const accountHint = input.row.accountHint?.trim();
  if (accountHint) {
    const normalizedHint = normalizeDescription(accountHint);
    const byHint = creditAccounts.filter((account) => {
      const normalizedName = normalizeDescription(account.name);
      const normalizedInstitution = account.institution ? normalizeDescription(account.institution) : "";
      return (
        normalizedName.includes(normalizedHint) ||
        normalizedHint.includes(normalizedName) ||
        (normalizedInstitution.length > 0 &&
          (normalizedInstitution.includes(normalizedHint) || normalizedHint.includes(normalizedInstitution)))
      );
    });

    if (byHint.length === 1) {
      return byHint[0].id;
    }
  }

  if (input.currentAccount.type !== "credit") {
    const linkedCards = filterCreditAccountsByInstitution(
      creditAccounts.filter((account) => account.parentAccountId === input.currentAccount.id),
      institutionHint
    );
    if (linkedCards.length === 1) {
      return linkedCards[0].id;
    }
  }

  if (institutionHint) {
    const sameInstitutionCards = filterCreditAccountsByInstitution(creditAccounts, institutionHint);

    if (sameInstitutionCards.length === 1) {
      return sameInstitutionCards[0].id;
    }
  }

  if (creditAccounts.length === 1 && !institutionHint) {
    return creditAccounts[0].id;
  }

  return null;
}

function buildAutoCreditAccountName(parent: UserAccount): string {
  const institution = parent.institution?.trim();
  if (institution) {
    return `Cartao ${institution}`;
  }
  return `Cartao ${parent.name}`.trim();
}

function buildAutoCreditAccountNameFromHint(input: {
  parent: UserAccount;
  row: ImportRowInput;
  fileName?: string;
}): string {
  const institutionHint = resolveCreditInstitutionHint({
    row: input.row,
    fallbackInstitution: input.parent.institution ?? null,
    fileName: input.fileName
  });

  if (institutionHint) {
    return `Cartao ${institutionHint}`.trim();
  }

  return buildAutoCreditAccountName(input.parent);
}

async function ensureCreditAccountForInvoice(input: {
  userId: string;
  row: ImportRowInput;
  currentAccount: UserAccount;
  accounts: UserAccount[];
  accountById: Map<string, UserAccount>;
  fileName: string;
  defaultAccountId?: string;
  createdByParentKey: Map<string, string>;
  registerAccount: (account: UserAccount) => void;
}): Promise<{ accountId: string | null; autoCreated: boolean }> {
  const resolvedId = resolveCreditInvoiceAccountId({
    row: input.row,
    currentAccount: input.currentAccount,
    accounts: input.accounts,
    accountById: input.accountById,
    defaultAccountId: input.defaultAccountId
  });

  if (resolvedId) {
    return {
      accountId: resolvedId,
      autoCreated: false
    };
  }

  const institutionHint = resolveCreditInstitutionHint({
    row: input.row,
    fallbackInstitution: input.currentAccount.institution ?? null,
    fileName: input.fileName
  });
  const parentCandidate =
    input.currentAccount.type !== "credit"
      ? input.currentAccount
      : input.defaultAccountId
        ? input.accountById.get(input.defaultAccountId) ?? null
        : null;

  if (!parentCandidate || parentCandidate.type === "credit") {
    return {
      accountId: null,
      autoCreated: false
    };
  }

  const cacheKey = buildAutoCreditAccountCacheKey({
    parentAccountId: parentCandidate.id,
    institutionHint,
    fallbackName: parentCandidate.name
  });
  const cachedCreatedId = input.createdByParentKey.get(cacheKey);
  if (cachedCreatedId && input.accountById.has(cachedCreatedId)) {
    return {
      accountId: cachedCreatedId,
      autoCreated: false
    };
  }

  const linkedCards = filterCreditAccountsByInstitution(
    input.accounts.filter((account) => account.type === "credit" && account.parentAccountId === parentCandidate.id),
    institutionHint
  );
  if (linkedCards.length === 1) {
    return {
      accountId: linkedCards[0].id,
      autoCreated: false
    };
  }

  if (linkedCards.length > 1) {
    return {
      accountId: null,
      autoCreated: false
    };
  }

  try {
    const createdAccount = await accountsRepo.create({
      userId: input.userId,
      name: buildAutoCreditAccountNameFromHint({
        parent: parentCandidate,
        row: input.row,
        fileName: input.fileName
      }),
      type: "credit",
      institution: institutionHint ?? parentCandidate.institution ?? null,
      currency: parentCandidate.currency,
      parentAccountId: parentCandidate.id
    });

    if (!createdAccount || createdAccount.type !== "credit") {
      return {
        accountId: null,
        autoCreated: false
      };
    }

    input.registerAccount(createdAccount);
    input.createdByParentKey.set(cacheKey, createdAccount.id);

    return {
      accountId: createdAccount.id,
      autoCreated: true
    };
  } catch {
    return {
      accountId: null,
      autoCreated: false
    };
  }
}

async function ensureCreditAccountForCardPayment(input: {
  userId: string;
  row: ImportRowInput;
  fromAccount: UserAccount;
  accounts: UserAccount[];
  accountById: Map<string, UserAccount>;
  fileName: string;
  mappingCardPaymentTargetAccountId: string | null;
  createdByParentKey: Map<string, string>;
  registerAccount: (account: UserAccount) => void;
}): Promise<{ accountId: string | null; autoCreated: boolean }> {
  const resolvedId = resolveCardPaymentTargetAccountId({
    row: input.row,
    fromAccount: input.fromAccount,
    accounts: input.accounts,
    accountById: input.accountById,
    mappingCardPaymentTargetAccountId: input.mappingCardPaymentTargetAccountId
  });

  if (resolvedId) {
    return {
      accountId: resolvedId,
      autoCreated: false
    };
  }

  if (!isCheckingLikeAccount(input.fromAccount.type)) {
    return {
      accountId: null,
      autoCreated: false
    };
  }

  const institutionHint = resolveCreditInstitutionHint({
    row: input.row,
    fallbackInstitution: input.fromAccount.institution ?? null,
    fileName: input.fileName
  });
  const cacheKey = buildAutoCreditAccountCacheKey({
    parentAccountId: input.fromAccount.id,
    institutionHint,
    fallbackName: input.fromAccount.name
  });
  const cachedCreatedId = input.createdByParentKey.get(cacheKey);
  if (cachedCreatedId && input.accountById.has(cachedCreatedId)) {
    return {
      accountId: cachedCreatedId,
      autoCreated: false
    };
  }

  const linkedCards = filterCreditAccountsByInstitution(
    input.accounts.filter((account) => account.type === "credit" && account.parentAccountId === input.fromAccount.id),
    institutionHint
  );
  if (linkedCards.length === 1) {
    return {
      accountId: linkedCards[0].id,
      autoCreated: false
    };
  }

  if (linkedCards.length > 1) {
    return {
      accountId: null,
      autoCreated: false
    };
  }

  try {
    const createdAccount = await accountsRepo.create({
      userId: input.userId,
      name: buildAutoCreditAccountNameFromHint({
        parent: input.fromAccount,
        row: input.row,
        fileName: input.fileName
      }),
      type: "credit",
      institution: institutionHint ?? input.fromAccount.institution ?? null,
      currency: input.fromAccount.currency,
      parentAccountId: input.fromAccount.id
    });

    if (!createdAccount || createdAccount.type !== "credit") {
      return {
        accountId: null,
        autoCreated: false
      };
    }

    input.registerAccount(createdAccount);
    input.createdByParentKey.set(cacheKey, createdAccount.id);

    console.info(
      `[IMPORT] ${JSON.stringify({
        event: "import.card_payment.credit_account.autocreate",
        accountId: createdAccount.id,
        accountName: createdAccount.name,
        parentAccountId: input.fromAccount.id,
        parentAccountName: input.fromAccount.name,
        institution: createdAccount.institution ?? null,
        description: input.row.description
      })}`
    );

    return {
      accountId: createdAccount.id,
      autoCreated: true
    };
  } catch {
    return {
      accountId: null,
      autoCreated: false
    };
  }
}

function matchesCreditAccountDescriptionHint(input: {
  normalizedDescription: string;
  creditAccount: UserAccount;
}): boolean {
  const normalizedDescription = input.normalizedDescription;
  const normalizedInstitution = normalizeInstitutionValue(input.creditAccount.institution);
  const normalizedName = normalizeDescription(input.creditAccount.name);

  if (normalizedInstitution && normalizedDescription.includes(normalizedInstitution)) {
    return true;
  }

  if (normalizedName && normalizedDescription.includes(normalizedName)) {
    return true;
  }

  return false;
}

async function relinkUnmatchedCardPaymentsForCreditAccount(input: {
  userId: string;
  creditAccount: UserAccount;
  accounts: UserAccount[];
}): Promise<{ linkedTransactionIds: string[] }> {
  const parentAccountId = input.creditAccount.parentAccountId?.trim() || null;
  let sourceAccounts = parentAccountId
    ? input.accounts.filter((account) => account.id === parentAccountId && isCheckingLikeAccount(account.type))
    : [];

  if (sourceAccounts.length === 0) {
    const institution = input.creditAccount.institution?.trim();
    if (institution) {
      sourceAccounts = input.accounts.filter(
        (account) =>
          isCheckingLikeAccount(account.type) &&
          normalizeInstitutionValue(account.institution) === normalizeInstitutionValue(institution)
      );
    }
  }

  if (sourceAccounts.length !== 1) {
    return {
      linkedTransactionIds: []
    };
  }

  const sourceAccount = sourceAccounts[0];
  const linkedCardsForSource = input.accounts.filter(
    (account) => account.type === "credit" && account.parentAccountId === sourceAccount.id
  );
  const requireDescriptionMatch = linkedCardsForSource.length > 1;
  const candidates = await transactionsRepo.listAll({
    userId: input.userId,
    accountId: sourceAccount.id,
    type: "transfer",
    excluded: false,
    hideCardPaymentMirrorInflow: false
  });
  const linkedTransactionIds: string[] = [];

  for (const candidate of candidates) {
    const raw = (candidate.raw as Record<string, unknown> | null) ?? null;
    if (candidate.direction !== "out") continue;
    if (!candidate.isInternalTransfer) continue;
    if (candidate.transferToAccountId) continue;
    if (!readRawBoolean(raw, "transferDetectedFromCardPayment")) continue;
    if (
      requireDescriptionMatch &&
      !matchesCreditAccountDescriptionHint({
        normalizedDescription: candidate.normalizedDescription,
        creditAccount: input.creditAccount
      })
    ) {
      continue;
    }

    const updated = await transactionsRepo.update({
      id: candidate.id,
      userId: input.userId,
      transferToAccountId: input.creditAccount.id
    });

    if (updated) {
      linkedTransactionIds.push(candidate.id);
    }
  }

  if (linkedTransactionIds.length > 0) {
    await syncLedgerForLegacyTransactions({
      userId: input.userId,
      transactionIds: linkedTransactionIds
    });
  }

  return {
    linkedTransactionIds
  };
}

async function ensureImportedAccountForRow(input: {
  userId: string;
  row: ImportRowInput;
  sourceType: ImportCommitPayload["sourceType"];
  fileName: string;
  accountById: Map<string, UserAccount>;
  registerAccount: (account: UserAccount) => void;
  createdByKey: Map<string, string>;
}): Promise<{ accountId: string | null; autoCreated: boolean }> {
  const draft = inferImportedAccountDraft({
    row: input.row,
    sourceType: input.sourceType,
    fileName: input.fileName
  });

  if (!draft.name) {
    return {
      accountId: null,
      autoCreated: false
    };
  }

  const cacheKey = `${draft.type}:${normalizeDescription(draft.name)}`;
  const cachedId = input.createdByKey.get(cacheKey);
  if (cachedId && input.accountById.has(cachedId)) {
    return {
      accountId: cachedId,
      autoCreated: false
    };
  }

  const createdAccount = await accountsRepo.create({
    userId: input.userId,
    name: draft.name,
    type: draft.type,
    institution: draft.institution,
    currency: "BRL",
    parentAccountId: null
  });

  if (!createdAccount) {
    return {
      accountId: null,
      autoCreated: false
    };
  }

  input.registerAccount(createdAccount);
  input.createdByKey.set(cacheKey, createdAccount.id);

  console.info(
    `[IMPORT] ${JSON.stringify({
      event: "import.account.autocreate",
      sourceType: input.sourceType,
      fileName: input.fileName,
      accountId: createdAccount.id,
      accountName: createdAccount.name,
      accountType: createdAccount.type,
      institution: createdAccount.institution ?? null,
      accountHint: input.row.accountHint ?? null
    })}`
  );

  return {
    accountId: createdAccount.id,
    autoCreated: true
  };
}

async function buildAccountResolver(userId: string, defaultAccountId?: string) {
  const accounts = await accountsRepo.listByUser(userId);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountNameMap = new Map(accounts.map((account) => [normalizeDescription(account.name), account.id]));
  const institutionIndex = new Map<string, UserAccount[]>();

  for (const account of accounts) {
    const institution = account.institution?.trim();
    if (!institution) continue;
    const normalizedInstitution = normalizeDescription(institution);
    const current = institutionIndex.get(normalizedInstitution) ?? [];
    current.push(account);
    institutionIndex.set(normalizedInstitution, current);
  }

  const resolveAccountId = (row: ImportRowInput): string | null => {
    if (row.accountId && accountById.has(row.accountId)) {
      return row.accountId;
    }

    if (row.accountHint) {
      const normalizedHint = normalizeDescription(row.accountHint);
      const exact = accountNameMap.get(normalizedHint);
      if (exact) {
        return exact;
      }

      const fuzzy = [...accountNameMap.entries()].find(
        ([name]) => name.includes(normalizedHint) || normalizedHint.includes(name)
      );

      if (fuzzy) {
        return fuzzy[1] ?? null;
      }
    }

    const institutionHint = detectImportInstitutionHint([
      readRawString(row.raw, "importInstitutionHint"),
      readRawString(row.raw, "issuerProfile"),
      row.accountHint
    ]);

    if (institutionHint) {
      const matches = (institutionIndex.get(normalizeDescription(institutionHint)) ?? []).filter((account) =>
        isCreditCardInvoiceDocumentType(row.documentType) ? account.type === "credit" : account.type !== "credit"
      );

      if (matches.length === 1) {
        return matches[0]?.id ?? null;
      }
    }

    if (defaultAccountId && accountById.has(defaultAccountId)) {
      return defaultAccountId;
    }

    return null;
  };

  const registerAccount = (account: UserAccount): void => {
    accounts.push(account);
    accountById.set(account.id, account);
    accountNameMap.set(normalizeDescription(account.name), account.id);
    const institution = account.institution?.trim();
    if (institution) {
      const normalizedInstitution = normalizeDescription(institution);
      const current = institutionIndex.get(normalizedInstitution) ?? [];
      current.push(account);
      institutionIndex.set(normalizedInstitution, current);
    }
  };

  return {
    resolveAccountId,
    accounts,
    accountById,
    registerAccount
  };
}

type ImportDraftRow = {
  userId: string;
  accountId: string;
  categoryId: string | null;
  date: Date;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  direction: "in" | "out";
  isInternalTransfer: boolean;
  transferFromAccountId?: string | null;
  transferToAccountId?: string | null;
  status: "posted";
  excluded?: boolean;
  externalId?: string | null;
  importedHash: string;
  raw: Record<string, unknown>;
};

type PendingInternalTransferCandidate = {
  importRow: ImportDraftRow;
  absoluteAmountCents: number;
  direction: "in" | "out";
  normalizedDescription: string;
  externalId: string | undefined;
};

type InternalTransferReviewSuggestion = {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: number;
  confidence: number;
  description: string;
  counterpartDescription: string;
};

type OpeningBalanceCandidate = {
  accountId: string;
  date: Date;
  amount: number;
  balanceAfter: number;
  sourceType: ImportCommitPayload["sourceType"];
};

type InvoiceReconciliationAccumulator = {
  accountId: string;
  accountName: string;
  expectedPurchaseTotal: number | null;
  invoicePaymentTotal: number | null;
  invoiceTotalDue: number | null;
  actualPurchaseTotal: number;
  purchaseRowCount: number;
  skippedPaymentRowCount: number;
};

function directionFromAmount(amount: number): "in" | "out" {
  return amount >= 0 ? "in" : "out";
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function toAbsoluteCents(amount: number): number {
  return Math.round(Math.abs(amount) * 100);
}

function truncateToDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function dayBefore(date: Date): Date {
  return new Date(date.getTime() - ONE_DAY_MS);
}

function tryTrackOpeningBalanceCandidate(
  target: Map<string, OpeningBalanceCandidate>,
  input: {
    account: UserAccount;
    date: Date;
    amount: number;
    balanceAfter: number | null | undefined;
    sourceType: ImportCommitPayload["sourceType"];
  }
) {
  if (!isCheckingLikeAccount(input.account.type)) {
    return;
  }
  if (!Number.isFinite(input.balanceAfter) || !Number.isFinite(input.amount)) {
    return;
  }

  const candidateDate = truncateToDay(input.date);
  const nextCandidate: OpeningBalanceCandidate = {
    accountId: input.account.id,
    date: candidateDate,
    amount: Number(input.amount),
    balanceAfter: Number(input.balanceAfter),
    sourceType: input.sourceType
  };
  const existing = target.get(input.account.id);

  if (!existing) {
    target.set(input.account.id, nextCandidate);
    return;
  }

  if (candidateDate.getTime() < existing.date.getTime()) {
    target.set(input.account.id, nextCandidate);
  }
}

function inferOpeningBalanceAmount(candidate: OpeningBalanceCandidate): number {
  return roundCurrency(candidate.balanceAfter - candidate.amount);
}

function readRawFiniteNumber(raw: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = parseStrictMoneyInput(value);
      if (parsed !== null && Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function resolveExpectedInvoicePurchaseTotal(raw: Record<string, unknown> | null | undefined): number | null {
  const value = readRawFiniteNumber(raw, [
    "importInvoicePurchaseTotal",
    "invoicePurchaseTotal",
    "invoicePurchasesTotal",
    "invoiceTotalPurchases"
  ]);

  return value === null ? null : roundCurrency(Math.abs(value));
}

function resolveInvoicePaymentTotal(raw: Record<string, unknown> | null | undefined): number | null {
  const value = readRawFiniteNumber(raw, [
    "importInvoicePaymentTotal",
    "invoicePaymentTotal",
    "invoicePaymentsTotal",
    "invoiceTotalPayments"
  ]);

  return value === null ? null : roundCurrency(Math.abs(value));
}

function resolveInvoiceTotalDue(raw: Record<string, unknown> | null | undefined): number | null {
  const value = readRawFiniteNumber(raw, [
    "importInvoiceTotalDue",
    "invoiceTotalDue",
    "invoiceAmountDue",
    "invoiceDueTotal"
  ]);

  return value === null ? null : roundCurrency(Math.abs(value));
}

function getInvoiceReconciliationAccumulator(
  target: Map<string, InvoiceReconciliationAccumulator>,
  account: UserAccount
): InvoiceReconciliationAccumulator {
  const current = target.get(account.id);
  if (current) {
    return current;
  }

  const next: InvoiceReconciliationAccumulator = {
    accountId: account.id,
    accountName: account.name,
    expectedPurchaseTotal: null,
    invoicePaymentTotal: null,
    invoiceTotalDue: null,
    actualPurchaseTotal: 0,
    purchaseRowCount: 0,
    skippedPaymentRowCount: 0
  };
  target.set(account.id, next);
  return next;
}

function trackInvoiceExpectedTotal(input: {
  target: Map<string, InvoiceReconciliationAccumulator>;
  account: UserAccount;
  raw: Record<string, unknown> | null | undefined;
}) {
  const accumulator = getInvoiceReconciliationAccumulator(input.target, input.account);
  const expected = resolveExpectedInvoicePurchaseTotal(input.raw);
  const paymentTotal = resolveInvoicePaymentTotal(input.raw);
  const totalDue = resolveInvoiceTotalDue(input.raw);

  if (expected !== null) {
    accumulator.expectedPurchaseTotal = expected;
  }
  if (paymentTotal !== null) {
    accumulator.invoicePaymentTotal = paymentTotal;
  }
  if (totalDue !== null) {
    accumulator.invoiceTotalDue = totalDue;
  }
}

function trackInvoiceImportedPurchase(input: {
  target: Map<string, InvoiceReconciliationAccumulator>;
  account: UserAccount;
  amount: number;
}) {
  if (!Number.isFinite(input.amount)) {
    return;
  }

  const accumulator = getInvoiceReconciliationAccumulator(input.target, input.account);
  const signedPurchaseAmount = input.amount < 0 ? Math.abs(input.amount) : -Math.abs(input.amount);
  accumulator.actualPurchaseTotal = roundCurrency(accumulator.actualPurchaseTotal + signedPurchaseAmount);
  accumulator.purchaseRowCount += 1;
}

function trackInvoiceSkippedPayment(input: {
  target: Map<string, InvoiceReconciliationAccumulator>;
  account: UserAccount;
}) {
  const accumulator = getInvoiceReconciliationAccumulator(input.target, input.account);
  accumulator.skippedPaymentRowCount += 1;
}

function deriveExpectedInvoicePurchaseTotal(
  accumulator: InvoiceReconciliationAccumulator,
  actualPurchaseTotal: number
): number | null {
  const explicitExpected = accumulator.expectedPurchaseTotal;
  const paymentTotal = accumulator.invoicePaymentTotal;
  const totalDue = accumulator.invoiceTotalDue;
  const recomposedFromDueAndPayments =
    paymentTotal !== null && totalDue !== null
      ? roundCurrency(totalDue + paymentTotal)
      : null;

  if (explicitExpected !== null && recomposedFromDueAndPayments !== null) {
    const explicitDelta = Math.abs(actualPurchaseTotal - explicitExpected);
    const recomposedDelta = Math.abs(actualPurchaseTotal - recomposedFromDueAndPayments);
    return recomposedDelta + INVOICE_RECONCILIATION_TOLERANCE < explicitDelta
      ? recomposedFromDueAndPayments
      : explicitExpected;
  }

  if (explicitExpected !== null) {
    return explicitExpected;
  }

  return recomposedFromDueAndPayments;
}

function reconcileCreditCardInvoices(target: Map<string, InvoiceReconciliationAccumulator>) {
  const accounts = [...target.values()]
    .map((item) => {
      const actualPurchaseTotal = roundCurrency(item.actualPurchaseTotal);
      const expected = deriveExpectedInvoicePurchaseTotal(item, actualPurchaseTotal);
      if (expected === null) {
        return null;
      }

      const expectedPurchaseTotal = roundCurrency(Number(expected));
      const delta = roundCurrency(actualPurchaseTotal - expectedPurchaseTotal);

      return {
        accountId: item.accountId,
        accountName: item.accountName,
        expectedPurchaseTotal,
        actualPurchaseTotal,
        delta,
        purchaseRowCount: item.purchaseRowCount,
        skippedPaymentRowCount: item.skippedPaymentRowCount,
        ok: Math.abs(delta) <= INVOICE_RECONCILIATION_TOLERANCE
      };
    })
    .filter(
      (
        item
      ): item is {
        accountId: string;
        accountName: string;
        expectedPurchaseTotal: number;
        actualPurchaseTotal: number;
        delta: number;
        purchaseRowCount: number;
        skippedPaymentRowCount: number;
        ok: boolean;
      } => item !== null
    );
  const mismatchCount = accounts.filter((item) => !item.ok).length;

  return {
    ok: mismatchCount === 0,
    checkedAccountCount: accounts.length,
    mismatchCount,
    tolerance: INVOICE_RECONCILIATION_TOLERANCE,
    accounts
  };
}

function buildOpeningBalanceExternalId(accountId: string, firstDate: Date): string {
  return `${OPENING_BALANCE_EXTERNAL_ID_PREFIX}:${accountId}:${firstDate.toISOString().slice(0, 10)}`;
}

function buildOpeningBalanceDescription(accountName: string): string {
  return `${OPENING_BALANCE_DESCRIPTION_PREFIX} (${accountName})`;
}

function normalizeExternalIdentity(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function buildExternalIdentityKey(accountId: string, externalId: string): string {
  return `${accountId}|${externalId}`;
}

function hasInternalTransferKeyword(normalizedDescription: string): boolean {
  return INTERNAL_TRANSFER_KEYWORD_PATTERN.test(normalizedDescription);
}

function isWithinInternalTransferDateWindow(left: Date, right: Date): boolean {
  return Math.abs(left.getTime() - right.getTime()) <= INTERNAL_TRANSFER_MAX_DATE_DIFF_MS;
}

function tokenizeInternalTransferDescription(normalizedDescription: string): string[] {
  return normalizedDescription
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Z0-9]/g, "").trim())
    .filter((token) => token.length >= 3 && !INTERNAL_TRANSFER_STOPWORDS.has(token));
}

function computeInternalTransferDescriptionConfidence(left: string, right: string): number {
  if (!INTERNAL_TRANSFER_DESCRIPTION_HINT_PATTERN.test(left) || !INTERNAL_TRANSFER_DESCRIPTION_HINT_PATTERN.test(right)) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftTokens = new Set(tokenizeInternalTransferDescription(left));
  const rightTokens = new Set(tokenizeInternalTransferDescription(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    if (left.includes(right) || right.includes(left)) {
      return 0.75;
    }
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  if (union <= 0) {
    return 0;
  }

  return intersection / union;
}

function computeInternalTransferMatchScore(input: {
  amountMatches: boolean;
  dateDiffMs: number;
  descriptionScore: number;
}): number {
  const amountScore = input.amountMatches ? 1 : 0;
  const boundedDateDiff = Math.max(0, Math.min(input.dateDiffMs, INTERNAL_TRANSFER_MAX_DATE_DIFF_MS));
  const dateScore = 1 - boundedDateDiff / (INTERNAL_TRANSFER_MAX_DATE_DIFF_MS * 2);
  const descriptionScore = Math.max(0, Math.min(input.descriptionScore, 1));

  return (
    amountScore * INTERNAL_TRANSFER_SCORE_WEIGHTS.amount +
    dateScore * INTERNAL_TRANSFER_SCORE_WEIGHTS.date +
    descriptionScore * INTERNAL_TRANSFER_SCORE_WEIGHTS.description
  );
}

function shouldAttemptAutomaticInternalTransferMatch(input: {
  type: "income" | "expense";
  normalizedDescription: string;
}): boolean {
  return hasInternalTransferKeyword(input.normalizedDescription) && (input.type === "income" || input.type === "expense");
}

function buildInstallmentRawMetadata(description: string): Record<string, unknown> {
  const installment = extractInstallmentInfo(description);
  if (!installment) {
    return {};
  }

  return {
    installmentDetected: true,
    installmentCurrent: installment.currentInstallment,
    installmentTotal: installment.totalInstallments,
    installmentRemaining: installment.remainingInstallments,
    installmentMarker: installment.marker,
    installmentBaseDescription: installment.baseDescription,
    installmentBaseNormalizedDescription: installment.normalizedBaseDescription
  };
}

export async function commitImportForUser(userId: string, payload: ImportCommitPayload) {
  const { resolveAccountId, accounts, accountById, registerAccount } = await buildAccountResolver(
    userId,
    payload.defaultAccountId
  );
  const mappingOptions = resolveMappingOptions(payload.mapping);
  const categorizationContext = await loadImportAutocategorizationContext(userId, {
    applyRules: payload.applyRules
  });
  const shouldApplyDeterministic = payload.applyRules;

  let missingAccountCount = 0;
  let invalidRowCount = 0;
  let invalidDateCount = 0;
  let skippedCardPaymentLines = 0;
  let invalidTransferRowsCount = 0;
  let creditInvoiceRowsNotRouted = 0;
  let creditInvoiceRowsReassigned = 0;
  let creditInvoiceAccountsAutoCreated = 0;
  let cardPaymentCreditAccountsAutoCreated = 0;
  let relinkedHistoricalCardPayments = 0;
  let importedCheckingAccountsAutoCreated = 0;
  let importedCreditAccountsAutoCreated = 0;
  let deterministicCategorizedCount = 0;
  let totalCardPaymentsDetected = 0;
  let totalCardPaymentsNotConverted = 0;
  let totalTransfersCreated = 0;
  let totalInternalTransfersAutoMatched = 0;
  let openingBalanceAdjustmentsCreated = 0;
  let confirmedBalanceSnapshotsCreated = 0;
  const warnings: string[] = [];
  let cardPaymentNotConvertedWarnings = 0;
  const autoCreatedCreditByParentKey = new Map<string, string>();
  const autoCreatedImportedAccountByKey = new Map<string, string>();
  const statementReconciliationCandidates: Array<{
    accountId: string;
    accountType: UserAccount["type"];
    date: Date;
    sequence: number;
    amount: number;
    balanceAfter?: number | null;
    description?: string | null;
  }> = [];
  const openingBalanceCandidateByAccountId = new Map<string, OpeningBalanceCandidate>();
  const invoiceReconciliationByAccountId = new Map<string, InvoiceReconciliationAccumulator>();
  const relinkedCreditAccountIds = new Set<string>();
  const missingAccountSamples: Array<{
    rowIndex: number;
    description: string;
    accountHint: string | null;
    documentType: string | null;
  }> = [];

  const importRows: ImportDraftRow[] = [];
  const transferRows: Array<{
    userId: string;
    fromAccountId: string;
    toAccountId: string;
    date: Date;
    description: string;
    normalizedDescription: string;
    amount: number;
    status: "posted";
    transferHashBase: string;
    externalIdBase: string | null;
    outExternalId: string | null;
    inExternalId: string | null;
    outImportedHash: string;
    inImportedHash: string;
    raw: Record<string, unknown>;
  }> = [];
  const pendingInternalTransferCandidates: PendingInternalTransferCandidate[] = [];
  const transferReviewSuggestions: InternalTransferReviewSuggestion[] = [];
  const transferReviewSuggestionKeys = new Set<string>();

  for (const [rowIndex, row] of payload.rows.entries()) {
    let resolvedAccountId = resolveAccountId(row);
    if (!resolvedAccountId) {
      const autoCreatedResolution = await ensureImportedAccountForRow({
        userId,
        row,
        sourceType: payload.sourceType,
        fileName: payload.fileName,
        accountById,
        registerAccount,
        createdByKey: autoCreatedImportedAccountByKey
      });

      if (autoCreatedResolution.accountId) {
        resolvedAccountId = autoCreatedResolution.accountId;
        if (autoCreatedResolution.autoCreated) {
          const autoCreatedAccount = accountById.get(autoCreatedResolution.accountId);
          if (autoCreatedAccount?.type === "credit") {
            importedCreditAccountsAutoCreated += 1;
          } else {
            importedCheckingAccountsAutoCreated += 1;
          }
        }
      }
    }

    if (!resolvedAccountId) {
      missingAccountCount += 1;
      if (missingAccountSamples.length < 10) {
        missingAccountSamples.push({
          rowIndex,
          description: row.description,
          accountHint: sanitizeAccountName(row.accountHint) ?? readRawString(row.raw, "importAccountHint"),
          documentType: row.documentType ?? null
        });
      }
      continue;
    }

    let resolvedAccount = accountById.get(resolvedAccountId);
    if (!resolvedAccount) {
      missingAccountCount += 1;
      if (missingAccountSamples.length < 10) {
        missingAccountSamples.push({
          rowIndex,
          description: row.description,
          accountHint: sanitizeAccountName(row.accountHint) ?? readRawString(row.raw, "importAccountHint"),
          documentType: row.documentType ?? null
        });
      }
      continue;
    }

    const isInvoiceRow = isCreditCardInvoiceDocumentType(row.documentType);

    if (isInvoiceRow && resolvedAccount.type !== "credit") {
      const creditResolution = await ensureCreditAccountForInvoice({
        userId,
        row,
        currentAccount: resolvedAccount,
        accounts,
        accountById,
        fileName: payload.fileName,
        defaultAccountId: payload.defaultAccountId,
        createdByParentKey: autoCreatedCreditByParentKey,
        registerAccount
      });

      if (!creditResolution.accountId) {
        invalidRowCount += 1;
        creditInvoiceRowsNotRouted += 1;
        continue;
      }

      const creditAccount = accountById.get(creditResolution.accountId);
      if (!creditAccount || creditAccount.type !== "credit") {
        invalidRowCount += 1;
        creditInvoiceRowsNotRouted += 1;
        continue;
      }

      resolvedAccountId = creditAccount.id;
      resolvedAccount = creditAccount;
      creditInvoiceRowsReassigned += 1;
      if (creditResolution.autoCreated) {
        creditInvoiceAccountsAutoCreated += 1;
      }
    }

    if (isInvoiceRow && resolvedAccount.type === "credit") {
      if (!relinkedCreditAccountIds.has(resolvedAccount.id)) {
        relinkedCreditAccountIds.add(resolvedAccount.id);
        const relinkResult = await relinkUnmatchedCardPaymentsForCreditAccount({
          userId,
          creditAccount: resolvedAccount,
          accounts
        });
        relinkedHistoricalCardPayments += relinkResult.linkedTransactionIds.length;
      }
    }

    let normalized: ReturnType<typeof normalizeTransaction>;
    try {
      normalized = normalizeTransaction({
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type
      });
    } catch (error) {
      invalidRowCount += 1;
      if (error instanceof Error && error.message.toLowerCase().includes("data invalida")) {
        invalidDateCount += 1;
      }
      continue;
    }

    if (!normalized.description || !Number.isFinite(normalized.amount)) {
      invalidRowCount += 1;
      continue;
    }

    const canonical = toCanonicalImportRow({
      date: normalized.date,
      amount: normalized.amount,
      type: normalized.type,
      sourceType: payload.sourceType,
      documentType: row.documentType ?? null,
      balanceAfter: row.balanceAfter ?? null,
      description: normalized.description,
      transactionKindRaw: row.transactionKindRaw,
      counterpartyRaw: row.counterpartyRaw,
      externalId: row.externalId,
      accountHint: row.accountHint,
      accountId: resolvedAccountId,
      categoryId: row.categoryId ?? null,
      raw: row.raw ?? {}
    });
    const canonicalExternalId = normalizeExternalIdentity(canonical.externalId ?? row.externalId);
    const installmentRawMetadata = buildInstallmentRawMetadata(canonical.description);
    if (isInvoiceRow && resolvedAccount.type === "credit") {
      trackInvoiceExpectedTotal({
        target: invoiceReconciliationByAccountId,
        account: resolvedAccount,
        raw: canonical.raw ?? row.raw ?? null
      });
    }

    if (
      shouldSkipCardPaymentOnCreditImport({
        accountType: resolvedAccount.type,
        normalizedDescription: canonical.normalizedDescription,
        amount: canonical.amount,
        skipCardPaymentLines: mappingOptions.skipCardPaymentLines
      })
    ) {
      if (isInvoiceRow && resolvedAccount.type === "credit") {
        trackInvoiceSkippedPayment({
          target: invoiceReconciliationByAccountId,
          account: resolvedAccount
        });
      }
      skippedCardPaymentLines += 1;
      continue;
    }

    const wantsExplicitTransfer =
      canonical.type === "transfer" || Boolean(row.transferToAccountId) || Boolean(row.transferFromAccountId);
    const detectedCardPayment = shouldDetectCardPaymentFromStatement({
      accountType: resolvedAccount.type,
      normalizedDescription: canonical.normalizedDescription
    });
    const normalizedCardPaymentAmount = detectedCardPayment ? -Math.abs(canonical.amount) : canonical.amount;
    const shouldConvertDetectedCardPayment =
      detectedCardPayment && mappingOptions.convertCardPaymentsToTransfer;

    if (detectedCardPayment) {
      totalCardPaymentsDetected += 1;
    }

    if (wantsExplicitTransfer || shouldConvertDetectedCardPayment) {
      const fromAccountId = row.transferFromAccountId?.trim() || resolvedAccountId;
      const fromAccount = accountById.get(fromAccountId);

      if (!fromAccount) {
        invalidRowCount += 1;
        invalidTransferRowsCount += 1;
        continue;
      }

      let toAccountId = row.transferToAccountId?.trim() || null;

      if (!toAccountId && detectedCardPayment) {
        const cardPaymentResolution = await ensureCreditAccountForCardPayment({
          userId,
          row,
          fromAccount,
          accounts,
          accountById,
          fileName: payload.fileName,
          mappingCardPaymentTargetAccountId: mappingOptions.cardPaymentTargetAccountId,
          createdByParentKey: autoCreatedCreditByParentKey,
          registerAccount
        });
        toAccountId = cardPaymentResolution.accountId;
        if (cardPaymentResolution.autoCreated) {
          cardPaymentCreditAccountsAutoCreated += 1;
        }
      }

      if (detectedCardPayment) {
        const cardTarget = toAccountId ? accountById.get(toAccountId) : null;
        if (!cardTarget || cardTarget.type !== "credit") {
          totalCardPaymentsNotConverted += 1;
          cardPaymentNotConvertedWarnings += 1;
          toAccountId = null;
        } else if (!relinkedCreditAccountIds.has(cardTarget.id)) {
          relinkedCreditAccountIds.add(cardTarget.id);
          const relinkResult = await relinkUnmatchedCardPaymentsForCreditAccount({
            userId,
            creditAccount: cardTarget,
            accounts
          });
          relinkedHistoricalCardPayments += relinkResult.linkedTransactionIds.length;
        }
      }

      if (wantsExplicitTransfer && !toAccountId) {
        invalidRowCount += 1;
        invalidTransferRowsCount += 1;
        continue;
      }

      if (toAccountId) {
        const toAccount = accountById.get(toAccountId);
        if (!toAccount || toAccount.id === fromAccount.id) {
          invalidRowCount += 1;
          invalidTransferRowsCount += 1;
          continue;
        }

        statementReconciliationCandidates.push({
          accountId: fromAccount.id,
          accountType: fromAccount.type,
          date: canonical.date,
          sequence: rowIndex,
          amount: normalizedCardPaymentAmount,
          balanceAfter: canonical.balanceAfter ?? null,
          description: canonical.description
        });

        tryTrackOpeningBalanceCandidate(openingBalanceCandidateByAccountId, {
          account: fromAccount,
          date: canonical.date,
          amount: normalizedCardPaymentAmount,
          balanceAfter: canonical.balanceAfter,
          sourceType: payload.sourceType
        });

        const transferHashBase = createTransferKeyHash({
          userId,
          date: canonical.date,
          amount: normalizedCardPaymentAmount,
          normalizedDescription: canonical.normalizedDescription,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          externalId: canonicalExternalId
        });
        const outExternalId = canonicalExternalId ? `${canonicalExternalId}:OUT` : null;
        const inExternalId = canonicalExternalId ? `${canonicalExternalId}:IN` : null;

        transferRows.push({
          userId,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          date: canonical.date,
          description: canonical.description,
          normalizedDescription: canonical.normalizedDescription,
          amount: normalizedCardPaymentAmount,
          status: "posted",
          transferHashBase,
          externalIdBase: canonicalExternalId,
          outExternalId,
          inExternalId,
          outImportedHash: `${transferHashBase}:OUT`,
          inImportedHash: `${transferHashBase}:IN`,
          raw: {
            ...(canonical.raw ?? {}),
            ...installmentRawMetadata,
            balanceAfter: canonical.balanceAfter ?? null,
            transactionKindRaw: canonical.transactionKindRaw,
            counterpartyRaw: canonical.counterpartyRaw,
            transactionKindNorm: canonical.transactionKindNorm,
            counterpartyNorm: canonical.counterpartyNorm,
            merchantKey: canonical.merchantKey,
            sourceType: canonical.sourceType,
            documentType: canonical.documentType ?? null,
            transferDetectedFromCardPayment: detectedCardPayment,
            transferFromAccountId: fromAccount.id,
            transferToAccountId: toAccount.id
          }
        });
        continue;
      }

      if (detectedCardPayment) {
        statementReconciliationCandidates.push({
          accountId: fromAccount.id,
          accountType: fromAccount.type,
          date: canonical.date,
          sequence: rowIndex,
          amount: normalizedCardPaymentAmount,
          balanceAfter: canonical.balanceAfter ?? null,
          description: canonical.description
        });

        tryTrackOpeningBalanceCandidate(openingBalanceCandidateByAccountId, {
          account: fromAccount,
          date: canonical.date,
          amount: normalizedCardPaymentAmount,
          balanceAfter: canonical.balanceAfter,
          sourceType: payload.sourceType
        });

        const importedHash = createImportedHash({
          userId,
          sourceType: payload.sourceType,
          date: canonical.date,
          amount: normalizedCardPaymentAmount,
          normalizedDescription: canonical.normalizedDescription,
          accountId: fromAccount.id,
          externalId: canonicalExternalId
        });

        importRows.push({
          userId,
          accountId: fromAccount.id,
          categoryId: null,
          date: canonical.date,
          description: canonical.description,
          normalizedDescription: canonical.normalizedDescription,
          amount: normalizedCardPaymentAmount,
          type: "transfer",
          direction: "out",
          isInternalTransfer: true,
          transferFromAccountId: fromAccount.id,
          transferToAccountId: null,
          status: "posted",
          externalId: canonicalExternalId,
          importedHash,
          raw: {
            ...(canonical.raw ?? {}),
            ...installmentRawMetadata,
            balanceAfter: canonical.balanceAfter ?? null,
            transactionKindRaw: canonical.transactionKindRaw,
            counterpartyRaw: canonical.counterpartyRaw,
            transactionKindNorm: canonical.transactionKindNorm,
            counterpartyNorm: canonical.counterpartyNorm,
            merchantKey: canonical.merchantKey,
            sourceType: canonical.sourceType,
            documentType: canonical.documentType ?? null,
            transferDetectedFromCardPayment: true,
            transferFromAccountId: fromAccount.id,
            transferToAccountId: null
          }
        });
        continue;
      }
    }

    const canonicalForClassification =
      detectedCardPayment && !mappingOptions.convertCardPaymentsToTransfer
        ? {
            ...canonical,
            amount: normalizedCardPaymentAmount,
            type: "expense" as const
          }
        : canonical;

    statementReconciliationCandidates.push({
      accountId: resolvedAccount.id,
      accountType: resolvedAccount.type,
      date: canonicalForClassification.date,
      sequence: rowIndex,
      amount: canonicalForClassification.amount,
      balanceAfter: canonicalForClassification.balanceAfter ?? null,
      description: canonicalForClassification.description
    });

    tryTrackOpeningBalanceCandidate(openingBalanceCandidateByAccountId, {
      account: resolvedAccount,
      date: canonicalForClassification.date,
      amount: canonicalForClassification.amount,
      balanceAfter: canonicalForClassification.balanceAfter,
      sourceType: payload.sourceType
    });

    const canonicalType =
      canonicalForClassification.type === "transfer"
        ? (canonicalForClassification.amount >= 0 ? "income" : "expense")
        : canonicalForClassification.type;

    const deterministic = shouldApplyDeterministic
      ? categorizeCanonicalImportRowWithContext({
          row: canonicalForClassification,
          accountId: resolvedAccountId,
          context: categorizationContext
        })
      : {
          categoryId: null,
          categorySource: "none" as const,
          confidence: "none" as const,
          shouldReview: true,
          reason: null,
          merchantKey: canonicalForClassification.merchantKey,
          matchedRule: null
        };

    const previewCategorySource =
      row.raw && typeof row.raw.categorySource === "string" ? row.raw.categorySource : null;
    const hasAutoSuggestedCategory = Boolean(row.categoryId) && previewCategorySource !== null && previewCategorySource !== "manual";
    const hasManualCategoryOverride = Boolean(row.categoryId) && !hasAutoSuggestedCategory;
    const categoryId = hasManualCategoryOverride ? (row.categoryId ?? null) : deterministic.categoryId;
    if (!hasManualCategoryOverride && deterministic.categoryId) {
      deterministicCategorizedCount += 1;
    }

    const importedHash = createImportedHash({
      userId,
      sourceType: payload.sourceType,
      date: canonical.date,
      amount: canonicalForClassification.amount,
      normalizedDescription: canonical.normalizedDescription,
      accountId: resolvedAccountId,
      externalId: canonicalExternalId
    });

    const draftImportRow: ImportDraftRow = {
      userId,
      accountId: resolvedAccountId,
      categoryId,
      date: canonical.date,
      description: canonical.description,
      normalizedDescription: canonical.normalizedDescription,
      amount: canonicalForClassification.amount,
      type: canonicalType,
      direction: directionFromAmount(canonicalForClassification.amount),
      isInternalTransfer: false,
      transferFromAccountId: null,
      transferToAccountId: null,
      status: "posted",
      externalId: canonicalExternalId,
      importedHash,
      raw: {
        ...(canonical.raw ?? {}),
        ...installmentRawMetadata,
        balanceAfter: canonical.balanceAfter ?? null,
        transactionKindRaw: canonical.transactionKindRaw,
        counterpartyRaw: canonical.counterpartyRaw,
        transactionKindNorm: canonical.transactionKindNorm,
        counterpartyNorm: canonical.counterpartyNorm,
        merchantKey: deterministic.merchantKey || canonical.merchantKey,
        sourceType: canonical.sourceType,
        documentType: canonical.documentType ?? null,
        categorySource: hasManualCategoryOverride ? "manual" : deterministic.categorySource,
        categorizationConfidence: hasManualCategoryOverride ? "high" : deterministic.confidence,
        categorizationReason: hasManualCategoryOverride
          ? "Categoria informada manualmente no preview."
          : deterministic.reason,
        categorizationReviewNeeded: hasManualCategoryOverride ? false : deterministic.shouldReview,
        matchedRule: hasManualCategoryOverride ? null : deterministic.matchedRule
      }
    };

    if (isInvoiceRow && resolvedAccount.type === "credit") {
      trackInvoiceImportedPurchase({
        target: invoiceReconciliationByAccountId,
        account: resolvedAccount,
        amount: canonicalForClassification.amount
      });
    }

    if (
      shouldAttemptAutomaticInternalTransferMatch({
        type: canonicalType,
        normalizedDescription: canonical.normalizedDescription
      })
    ) {
      const absoluteAmountCents = toAbsoluteCents(canonical.amount);
      const oppositeDirection = draftImportRow.direction === "out" ? "in" : "out";
      let bestMatchIndex = -1;
      let bestMatchConfidence = 0;
      let bestMatchDateDiffMs = Number.POSITIVE_INFINITY;
      let bestReviewMatchIndex = -1;
      let bestReviewConfidence = 0;
      let bestReviewDateDiffMs = Number.POSITIVE_INFINITY;

      for (let index = 0; index < pendingInternalTransferCandidates.length; index += 1) {
        const candidate = pendingInternalTransferCandidates[index];
        if (candidate.direction !== oppositeDirection) continue;
        if (candidate.absoluteAmountCents !== absoluteAmountCents) continue;
        if (candidate.importRow.accountId === draftImportRow.accountId) continue;
        if (!isWithinInternalTransferDateWindow(candidate.importRow.date, draftImportRow.date)) continue;

        const dateDiffMs = Math.abs(candidate.importRow.date.getTime() - draftImportRow.date.getTime());

        const descriptionScore = computeInternalTransferDescriptionConfidence(
          candidate.normalizedDescription,
          draftImportRow.normalizedDescription
        );
        if (descriptionScore < INTERNAL_TRANSFER_MIN_DESCRIPTION_SCORE) continue;

        const confidence = computeInternalTransferMatchScore({
          amountMatches: true,
          dateDiffMs,
          descriptionScore
        });
        if (confidence >= INTERNAL_TRANSFER_REVIEW_MIN_TOTAL_SCORE) {
          const isBetterReviewConfidence = confidence > bestReviewConfidence;
          const isEqualReviewConfidenceCloserDate =
            confidence === bestReviewConfidence && dateDiffMs < bestReviewDateDiffMs;

          if (isBetterReviewConfidence || isEqualReviewConfidenceCloserDate) {
            bestReviewConfidence = confidence;
            bestReviewDateDiffMs = dateDiffMs;
            bestReviewMatchIndex = index;
          }
        }

        if (confidence < INTERNAL_TRANSFER_MIN_TOTAL_SCORE) continue;

        const isBetterConfidence = confidence > bestMatchConfidence;
        const isEqualConfidenceCloserDate =
          confidence === bestMatchConfidence && dateDiffMs < bestMatchDateDiffMs;

        if (isBetterConfidence || isEqualConfidenceCloserDate) {
          bestMatchConfidence = confidence;
          bestMatchDateDiffMs = dateDiffMs;
          bestMatchIndex = index;
        }
      }

      if (bestMatchIndex >= 0) {
        const matchedCandidate = pendingInternalTransferCandidates.splice(bestMatchIndex, 1)[0];
        if (matchedCandidate) {
          const outLeg = draftImportRow.direction === "out" ? draftImportRow : matchedCandidate.importRow;
          const inLeg = draftImportRow.direction === "in" ? draftImportRow : matchedCandidate.importRow;
          const transferDate = outLeg.date;
          const transferDescription = outLeg.description || inLeg.description;
          const transferNormalizedDescription =
            outLeg.normalizedDescription.length >= inLeg.normalizedDescription.length
              ? outLeg.normalizedDescription
              : inLeg.normalizedDescription;
          const transferHashBase = createTransferKeyHash({
            userId,
            date: transferDate,
            amount: outLeg.amount,
            normalizedDescription: transferNormalizedDescription,
            fromAccountId: outLeg.accountId,
            toAccountId: inLeg.accountId,
            externalId: row.externalId ?? matchedCandidate.externalId
          });
          const transferExternalId = normalizeExternalIdentity(row.externalId ?? matchedCandidate.externalId);
          const outExternalId = transferExternalId ? `${transferExternalId}:OUT` : null;
          const inExternalId = transferExternalId ? `${transferExternalId}:IN` : null;

          transferRows.push({
            userId,
            fromAccountId: outLeg.accountId,
            toAccountId: inLeg.accountId,
            date: transferDate,
            description: transferDescription,
            normalizedDescription: transferNormalizedDescription,
            amount: outLeg.amount,
            status: "posted",
            transferHashBase,
            externalIdBase: transferExternalId,
            outExternalId,
            inExternalId,
            outImportedHash: `${transferHashBase}:OUT`,
            inImportedHash: `${transferHashBase}:IN`,
            raw: {
              ...(outLeg.raw ?? {}),
              ...(inLeg.raw ?? {}),
              transferDetectedAutomatic: true,
              transferDetectedFromCardPayment: false,
              transferDetectedConfidence: Number(bestMatchConfidence.toFixed(3)),
              transferFromAccountId: outLeg.accountId,
              transferToAccountId: inLeg.accountId
            }
          });
          totalInternalTransfersAutoMatched += 1;
          continue;
        }
      }

      if (bestReviewMatchIndex >= 0 && transferReviewSuggestions.length < MAX_TRANSFER_REVIEW_SUGGESTIONS) {
        const reviewCandidate = pendingInternalTransferCandidates[bestReviewMatchIndex];
        if (reviewCandidate) {
          const reviewOutLeg = draftImportRow.direction === "out" ? draftImportRow : reviewCandidate.importRow;
          const reviewInLeg = draftImportRow.direction === "in" ? draftImportRow : reviewCandidate.importRow;
          const reviewDate = reviewOutLeg.date.toISOString().slice(0, 10);
          const reviewKey = [
            reviewOutLeg.accountId,
            reviewInLeg.accountId,
            reviewDate,
            String(toAbsoluteCents(reviewOutLeg.amount))
          ].join("|");

          if (!transferReviewSuggestionKeys.has(reviewKey)) {
            transferReviewSuggestionKeys.add(reviewKey);
            transferReviewSuggestions.push({
              fromAccountId: reviewOutLeg.accountId,
              toAccountId: reviewInLeg.accountId,
              date: reviewDate,
              amount: Number(Math.abs(reviewOutLeg.amount).toFixed(2)),
              confidence: Number(bestReviewConfidence.toFixed(3)),
              description: reviewOutLeg.description,
              counterpartDescription: reviewInLeg.description
            });
          }
        }
      }

      pendingInternalTransferCandidates.push({
        importRow: draftImportRow,
        absoluteAmountCents,
        direction: draftImportRow.direction,
        normalizedDescription: draftImportRow.normalizedDescription,
        externalId: normalizeExternalIdentity(row.externalId) ?? undefined
      });
      continue;
    }

    importRows.push(draftImportRow);
  }

  if (missingAccountCount > 0) {
    throw new ImportCommitError(
      422,
      "missing_account_binding",
      "Nao foi possivel vincular uma conta valida para todas as linhas do extrato. Ajuste a conta ou importe com um arquivo que traga identificacao suficiente.",
      {
        totalReceived: payload.rows.length,
        missingAccountCount,
        sampleRows: missingAccountSamples,
        autoCreatedAccounts: {
          checking: importedCheckingAccountsAutoCreated,
          credit:
            importedCreditAccountsAutoCreated + creditInvoiceAccountsAutoCreated + cardPaymentCreditAccountsAutoCreated
        }
      }
    );
  }

  if (pendingInternalTransferCandidates.length > 0) {
    for (const candidate of pendingInternalTransferCandidates) {
      importRows.push(candidate.importRow);
    }
  }

  const invoiceReconciliation = reconcileCreditCardInvoices(invoiceReconciliationByAccountId);
  if (!invoiceReconciliation.ok) {
    const mismatchedInvoices = invoiceReconciliation.accounts.filter((account) => !account.ok);

    console.error(
      `[IMPORT] ${JSON.stringify({
        event: "import.commit.invoice_reconciliation_failed",
        fileName: payload.fileName,
        sourceType: payload.sourceType,
        checkedAccountCount: invoiceReconciliation.checkedAccountCount,
        mismatchCount: invoiceReconciliation.mismatchCount,
        tolerance: invoiceReconciliation.tolerance,
        accounts: mismatchedInvoices
      })}`
    );

    throw new ImportCommitError(
      422,
      "invoice_reconciliation_failed",
      "A fatura foi rejeitada porque a soma das compras importadas não bate com o total da própria fatura.",
      {
        totalReceived: payload.rows.length,
        totalImported: 0,
        totalSkipped: payload.rows.length,
        invalidRows: invalidRowCount,
        checkedAccountCount: invoiceReconciliation.checkedAccountCount,
        mismatchCount: invoiceReconciliation.mismatchCount,
        tolerance: invoiceReconciliation.tolerance,
        accounts: mismatchedInvoices
      }
    );
  }

  if (invoiceReconciliation.checkedAccountCount > 0) {
    console.info(
      `[IMPORT] ${JSON.stringify({
        event: "import.commit.invoice_reconciliation_ok",
        fileName: payload.fileName,
        sourceType: payload.sourceType,
        checkedAccountCount: invoiceReconciliation.checkedAccountCount,
        tolerance: invoiceReconciliation.tolerance,
        accounts: invoiceReconciliation.accounts.map((account) => ({
          accountId: account.accountId,
          purchaseRowCount: account.purchaseRowCount,
          skippedPaymentRowCount: account.skippedPaymentRowCount,
          expectedPurchaseTotal: account.expectedPurchaseTotal,
          actualPurchaseTotal: account.actualPurchaseTotal,
          delta: account.delta
        }))
      })}`
    );
  }

  const statementReconciliation = reconcileAccountStatement(statementReconciliationCandidates);
  if (!statementReconciliation.ok) {
    const mismatchedAccounts = statementReconciliation.accounts
      .filter((account) => account.mismatchCount > 0)
      .map((account) => ({
        accountId: account.accountId,
        rowCount: account.rowCount,
        openingBalance: account.openingBalance,
        closingBalance: account.closingBalance,
        computedClosingBalance: account.computedClosingBalance,
        mismatchCount: account.mismatchCount,
        mismatches: account.mismatches
      }));

    console.error(
      `[IMPORT] ${JSON.stringify({
        event: "import.commit.reconciliation_failed",
        fileName: payload.fileName,
        sourceType: payload.sourceType,
        checkedAccountCount: statementReconciliation.checkedAccountCount,
        anchoredAccountCount: statementReconciliation.anchoredAccountCount,
        mismatchCount: statementReconciliation.mismatchCount,
        accounts: mismatchedAccounts
      })}`
    );

    throw new ImportCommitError(
      422,
      "statement_reconciliation_failed",
      "O extrato foi rejeitado porque os saldos por linha não reconciliam com as movimentações importadas.",
      {
        checkedAccountCount: statementReconciliation.checkedAccountCount,
        anchoredAccountCount: statementReconciliation.anchoredAccountCount,
        mismatchCount: statementReconciliation.mismatchCount,
        accounts: mismatchedAccounts
      }
    );
  }

  if (statementReconciliation.anchoredAccountCount > 0) {
    console.info(
      `[IMPORT] ${JSON.stringify({
        event: "import.commit.reconciliation_ok",
        fileName: payload.fileName,
        sourceType: payload.sourceType,
        checkedAccountCount: statementReconciliation.checkedAccountCount,
        anchoredAccountCount: statementReconciliation.anchoredAccountCount,
        totalRows: statementReconciliation.totalRows
      })}`
    );
  }

  if (openingBalanceCandidateByAccountId.size > 0) {
    const openingBalanceCandidates = [...openingBalanceCandidateByAccountId.values()].sort(
      (left, right) => left.date.getTime() - right.date.getTime()
    );

    for (const candidate of openingBalanceCandidates) {
      const openingAmount = inferOpeningBalanceAmount(candidate);
      if (Math.abs(openingAmount) < MIN_OPENING_BALANCE_ADJUSTMENT) {
        continue;
      }

      const hasHistoryBeforeWindow =
        (await transactionsRepo.countByAccountBeforeDate(userId, candidate.accountId, candidate.date)) > 0;
      if (hasHistoryBeforeWindow) {
        continue;
      }

      const account = accountById.get(candidate.accountId);
      if (!account) {
        continue;
      }

      const openingDate = dayBefore(candidate.date);
      const description = buildOpeningBalanceDescription(account.name);
      const normalizedDescription = normalizeDescription(description);
      const externalId = buildOpeningBalanceExternalId(candidate.accountId, candidate.date);
      const importedHash = createImportedHash({
        userId,
        sourceType: candidate.sourceType,
        date: openingDate,
        amount: openingAmount,
        normalizedDescription,
        accountId: candidate.accountId,
        externalId
      });

      importRows.push({
        userId,
        accountId: candidate.accountId,
        categoryId: null,
        date: openingDate,
        description,
        normalizedDescription,
        amount: openingAmount,
        type: openingAmount >= 0 ? "income" : "expense",
        direction: directionFromAmount(openingAmount),
        isInternalTransfer: false,
        transferFromAccountId: null,
        transferToAccountId: null,
        status: "posted",
        excluded: true,
        externalId,
        importedHash,
        raw: {
          sourceType: candidate.sourceType,
          openingBalanceAdjustment: true,
          openingBalanceFirstDate: candidate.date.toISOString().slice(0, 10),
          openingBalanceAfterFirstRow: candidate.balanceAfter,
          openingBalanceFirstAmount: candidate.amount
        }
      });
      openingBalanceAdjustmentsCreated += 1;
    }
  }

  const importedHashes = [
    ...importRows.map((row) => row.importedHash),
    ...transferRows.flatMap((row) => [row.outImportedHash, row.inImportedHash])
  ];
  const externalIdentities = [
    ...importRows
      .filter((row) => Boolean(row.externalId))
      .map((row) => ({
        accountId: row.accountId,
        externalId: row.externalId as string
      })),
    ...transferRows.flatMap((row) => {
      const pairs: Array<{ accountId: string; externalId: string }> = [];
      if (row.outExternalId) {
        pairs.push({
          accountId: row.fromAccountId,
          externalId: row.outExternalId
        });
      }
      if (row.inExternalId) {
        pairs.push({
          accountId: row.toAccountId,
          externalId: row.inExternalId
        });
      }
      return pairs;
    })
  ];
  const existingHashes = new Set(await transactionsRepo.findImportedHashes(userId, importedHashes));
  const existingExternalIdentityKeys = new Set(
    await transactionsRepo.findExistingExternalAccountKeys(userId, externalIdentities)
  );
  const seenInBatch = new Set<string>();
  const seenExternalIdentityKeysInBatch = new Set<string>();
  let duplicateInDatabaseCount = 0;
  let duplicateInPayloadCount = 0;

  const rowsToCreate = importRows.filter((row) => {
    const externalIdentityKey = row.externalId
      ? buildExternalIdentityKey(row.accountId, row.externalId)
      : null;
    if (externalIdentityKey && existingExternalIdentityKeys.has(externalIdentityKey)) {
      duplicateInDatabaseCount += 1;
      return false;
    }
    if (existingHashes.has(row.importedHash)) {
      duplicateInDatabaseCount += 1;
      return false;
    }
    if (externalIdentityKey && seenExternalIdentityKeysInBatch.has(externalIdentityKey)) {
      duplicateInPayloadCount += 1;
      return false;
    }
    if (seenInBatch.has(row.importedHash)) {
      duplicateInPayloadCount += 1;
      return false;
    }
    if (externalIdentityKey) {
      seenExternalIdentityKeysInBatch.add(externalIdentityKey);
    }
    seenInBatch.add(row.importedHash);
    return true;
  });

  const transferRowsToCreate = transferRows.filter((row) => {
    const outExternalIdentityKey = row.outExternalId
      ? buildExternalIdentityKey(row.fromAccountId, row.outExternalId)
      : null;
    const inExternalIdentityKey = row.inExternalId
      ? buildExternalIdentityKey(row.toAccountId, row.inExternalId)
      : null;

    const hasDuplicateExternalInDb =
      (outExternalIdentityKey && existingExternalIdentityKeys.has(outExternalIdentityKey)) ||
      (inExternalIdentityKey && existingExternalIdentityKeys.has(inExternalIdentityKey));
    if (hasDuplicateExternalInDb) {
      duplicateInDatabaseCount += 1;
      return false;
    }

    const hasDuplicateInDb = existingHashes.has(row.outImportedHash) || existingHashes.has(row.inImportedHash);
    if (hasDuplicateInDb) {
      duplicateInDatabaseCount += 1;
      return false;
    }

    const hasDuplicateInPayload = seenInBatch.has(row.outImportedHash) || seenInBatch.has(row.inImportedHash);
    if (hasDuplicateInPayload) {
      duplicateInPayloadCount += 1;
      return false;
    }

    const hasDuplicateExternalInPayload =
      (outExternalIdentityKey && seenExternalIdentityKeysInBatch.has(outExternalIdentityKey)) ||
      (inExternalIdentityKey && seenExternalIdentityKeysInBatch.has(inExternalIdentityKey));
    if (hasDuplicateExternalInPayload) {
      duplicateInPayloadCount += 1;
      return false;
    }

    seenInBatch.add(row.outImportedHash);
    seenInBatch.add(row.inImportedHash);
    if (outExternalIdentityKey) {
      seenExternalIdentityKeysInBatch.add(outExternalIdentityKey);
    }
    if (inExternalIdentityKey) {
      seenExternalIdentityKeysInBatch.add(inExternalIdentityKey);
    }
    return true;
  });

  const duplicates = duplicateInDatabaseCount + duplicateInPayloadCount;
  const invalidRows = missingAccountCount + invalidRowCount;
  const policySkippedRows = skippedCardPaymentLines;
  const totalSkipped = duplicates + invalidRows + policySkippedRows;
  const validSourceRows = Math.max(0, payload.rows.length - invalidRows - policySkippedRows);
  const plannedImported = rowsToCreate.length + transferRowsToCreate.length * 2;
  const canPersistConfirmedBalanceOnly =
    plannedImported === 0 &&
    duplicates > 0 &&
    invalidRows === 0 &&
    policySkippedRows === 0 &&
    statementReconciliation.anchoredAccountCount > 0;

  if (plannedImported === 0 && !canPersistConfirmedBalanceOnly) {
    throw new ImportCommitError(
      duplicates > 0 && invalidRows === 0 && policySkippedRows === 0 ? 409 : 422,
      duplicates > 0 && invalidRows === 0 && policySkippedRows === 0
        ? "import_no_new_transactions"
        : "import_no_valid_transactions",
      duplicates > 0 && invalidRows === 0 && policySkippedRows === 0
        ? "Todas as transacoes deste arquivo ja haviam sido importadas."
        : "Nenhuma transacao valida pode ser persistida com os dados enviados.",
      {
        totalReceived: payload.rows.length,
        totalImported: 0,
        totalSkipped,
        duplicates,
        invalidRows,
        duplicateDetails: {
          inDatabase: duplicateInDatabaseCount,
          inPayload: duplicateInPayloadCount
        },
        invalidDetails: {
          missingAccount: missingAccountCount,
          invalidRows: invalidRowCount,
          invalidDate: invalidDateCount,
          skippedCardPaymentLines,
          invalidTransferRows: invalidTransferRowsCount,
          creditInvoiceRowsNotRouted
        }
      }
    );
  }

  const batch = await importsRepo.createBatch({
    userId,
    sourceType: payload.sourceType,
    fileName: payload.fileName,
    mapping: payload.mapping
  });

  if (!batch) {
    throw new Error("Falha ao criar lote de importacao");
  }

  const createMany =
    rowsToCreate.length > 0
      ? await transactionsRepo.createMany(
          rowsToCreate.map((row) => ({
            ...row,
            importBatchId: batch.id
          }))
        )
      : { count: 0 };

  const importedTransferTimestamps: number[] = [];
  for (const row of transferRowsToCreate) {
    const created = await transactionsRepo.createTransferPair({
      userId: row.userId,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      date: row.date,
      description: row.description,
      normalizedDescription: row.normalizedDescription,
      amount: row.amount,
      status: row.status,
      isInternalTransfer: true,
      importBatchId: batch.id,
      importedHashBase: row.transferHashBase,
      externalIdBase: row.externalIdBase,
      raw: row.raw
    });

    if (created.created) {
      totalTransfersCreated += 1;
      importedTransferTimestamps.push(row.date.getTime());
      continue;
    }

    duplicateInDatabaseCount += 1;
  }

  const totalImported = createMany.count + totalTransfersCreated * 2;
  const transferReviewSuggestionsCount = transferReviewSuggestions.length;

  const importedDates = [...rowsToCreate.map((row) => row.date.getTime()), ...importedTransferTimestamps].filter(
    (value) => Number.isFinite(value)
  );
  const minTimestamp = importedDates.length > 0 ? Math.min(...importedDates) : null;
  const maxTimestamp = importedDates.length > 0 ? Math.max(...importedDates) : null;

  await importsRepo.updateBatchTotals({
    id: batch.id,
    totalImported,
    totalSkipped
  });

  if ((totalImported > 0 || canPersistConfirmedBalanceOnly) && statementReconciliation.anchoredAccountCount > 0) {
    const snapshots = statementReconciliation.accounts
      .filter(
        (account) =>
          account.mismatchCount === 0 &&
          Number.isFinite(account.closingBalance) &&
          account.closingBalanceDate !== null
      )
      .map((account) => ({
        accountId: account.accountId,
        balanceDate: new Date(account.closingBalanceDate as string),
        balance: Number(account.closingBalance),
        openingBalance: account.openingBalance,
        computedClosingBalance: account.computedClosingBalance,
        rowCount: account.rowCount,
        balanceAnchorCount: account.balanceAnchorCount
      }))
      .filter((snapshot) => Number.isFinite(snapshot.balanceDate.getTime()));

    const snapshotResult = await importsRepo.upsertAccountBalanceSnapshots({
      userId,
      batchId: batch.id,
      sourceType: payload.sourceType,
      fileName: payload.fileName,
      snapshots
    });
    confirmedBalanceSnapshotsCreated = snapshotResult.count;
  }

  let ledgerSync:
    | {
        processed: number;
        created: number;
        deduped: number;
        skipped: number;
      }
    | null = null;
  let ledgerConsistency:
    | {
        recoveredUnmirroredCount: number;
        remainingUnmirroredCount: number;
      }
    | null = null;
  let reconciliationBacklog:
    | {
        transferSuggestions: number;
        unmatchedCardPayments: number;
        pendingItems: number;
        reviewUrl: string | null;
      }
    | null = null;

  try {
    ledgerSync = await syncLedgerFromImportBatch({
      userId,
      importBatchId: batch.id,
      fileName: payload.fileName
    });

    const initialUnmirroredIds = await listUnmirroredImportBatchTransactionIds({
      userId,
      importBatchId: batch.id
    });

    if (initialUnmirroredIds.length > 0) {
      await syncLedgerForLegacyTransactions({
        userId,
        transactionIds: initialUnmirroredIds
      });

      const remainingUnmirroredIds = await listUnmirroredImportBatchTransactionIds({
        userId,
        importBatchId: batch.id
      });

      ledgerConsistency = {
        recoveredUnmirroredCount: initialUnmirroredIds.length - remainingUnmirroredIds.length,
        remainingUnmirroredCount: remainingUnmirroredIds.length
      };

      if (remainingUnmirroredIds.length > 0) {
        throw new ImportCommitError(
          500,
          "import_ledger_sync_incomplete",
          "Importação concluída sem espelhamento contábil completo no ledger.",
          {
            batchId: batch.id,
            totalImported,
            recoveredUnmirroredCount: ledgerConsistency.recoveredUnmirroredCount,
            remainingUnmirroredCount: remainingUnmirroredIds.length,
            unmirroredTransactionIds: remainingUnmirroredIds.slice(0, 50)
          }
        );
      }

      warnings.push(
        `${initialUnmirroredIds.length} lançamento(s) foram resincronizados para garantir consistência entre transações e ledger.`
      );
    } else {
      ledgerConsistency = {
        recoveredUnmirroredCount: 0,
        remainingUnmirroredCount: 0
      };
    }
  } catch (error) {
    if (error instanceof ImportCommitError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "falha desconhecida";
    throw new ImportCommitError(
      500,
      "import_ledger_sync_failed",
      "Falha ao sincronizar o ledger para este lote importado.",
      {
        batchId: batch.id,
        totalImported,
        reason: message
      }
    );
  }

  try {
    const inbox = await getReconciliationInboxForUser(userId);
    reconciliationBacklog = {
      transferSuggestions: inbox.summary.transferSuggestions,
      unmatchedCardPayments: inbox.summary.unmatchedCardPayments,
      pendingItems: inbox.summary.pendingItems,
      reviewUrl: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha desconhecida";
    warnings.push(`Não foi possível carregar o backlog de revisão (${message}).`);
  }

  const result = {
    batchId: batch.id,
    totalImported,
    totalSkipped,
    duplicates,
    invalidRows,
    totalTransfersCreated,
    totalInternalTransfersAutoMatched,
    totalCardPaymentsDetected,
    totalCardPaymentsNotConverted,
    warnings: [
      ...(importedCheckingAccountsAutoCreated > 0
        ? [`${importedCheckingAccountsAutoCreated} conta(s) bancária(s) foram criadas automaticamente a partir do arquivo.`]
        : []),
      ...(importedCreditAccountsAutoCreated > 0
        ? [`${importedCreditAccountsAutoCreated} conta(s) de cartão foram criadas automaticamente a partir da fatura importada.`]
        : []),
      ...(openingBalanceAdjustmentsCreated > 0
        ? [
            `${openingBalanceAdjustmentsCreated} ajuste(s) de saldo inicial foram adicionados automaticamente como lançamento excluído.`
          ]
        : []),
      ...(confirmedBalanceSnapshotsCreated > 0
        ? [
            `${confirmedBalanceSnapshotsCreated} saldo(s) confirmado(s) por extrato foram gravados para comparação com o saldo calculado.`
          ]
        : []),
      ...(totalImported === 0 && confirmedBalanceSnapshotsCreated > 0
        ? [
            "Nenhuma transação nova foi criada porque o arquivo já havia sido importado; apenas o saldo confirmado foi atualizado."
          ]
        : []),
      ...(cardPaymentNotConvertedWarnings > 0
        ? [
            `${cardPaymentNotConvertedWarnings} pagamento(s) de fatura foram registrados como transferencia sem conta destino definida.`
          ]
        : []),
      ...(skippedCardPaymentLines > 0
        ? [`${skippedCardPaymentLines} linha(s) de pagamento foram ignoradas na importacao da conta de cartao.`]
        : []),
      ...(invalidTransferRowsCount > 0
        ? [`${invalidTransferRowsCount} linha(s) marcadas como transferencia estavam incompletas e foram ignoradas.`]
        : []),
      ...(creditInvoiceRowsNotRouted > 0
        ? [
            `${creditInvoiceRowsNotRouted} linha(s) de fatura não foram importadas porque não foi possível definir a conta de cartão de crédito.`
          ]
        : []),
      ...(creditInvoiceRowsReassigned > 0
        ? [`${creditInvoiceRowsReassigned} linha(s) de fatura foram direcionadas automaticamente para conta de cartao.`]
        : []),
      ...(creditInvoiceAccountsAutoCreated > 0
        ? [
            `${creditInvoiceAccountsAutoCreated} conta(s) de cartão foram criadas automaticamente a partir da conta bancária vinculada.`
          ]
        : []),
      ...(cardPaymentCreditAccountsAutoCreated > 0
        ? [
            `${cardPaymentCreditAccountsAutoCreated} conta(s) de cartão foram criadas automaticamente a partir de pagamentos de fatura detectados no extrato bancário.`
          ]
        : []),
      ...(relinkedHistoricalCardPayments > 0
        ? [
            `${relinkedHistoricalCardPayments} pagamento(s) de fatura importados anteriormente foram vinculados ao cartão correto e resincronizados.`
          ]
        : []),
      ...(transferReviewSuggestionsCount > 0
        ? [
            `${transferReviewSuggestionsCount} possível(is) transferência(s) interna(s) com confiança média foram detectadas para revisão manual.`
          ]
        : []),
      ...warnings
    ],
    duplicateDetails: {
      inDatabase: duplicateInDatabaseCount,
      inPayload: duplicateInPayloadCount
    },
    invalidDetails: {
      missingAccount: missingAccountCount,
      invalidRows: invalidRowCount,
      invalidDate: invalidDateCount,
      skippedCardPaymentLines,
      invalidTransferRows: invalidTransferRowsCount,
      creditInvoiceRowsNotRouted
    },
    summary: {
      imported: totalImported,
      skipped: totalSkipped,
      duplicates,
      invalid: invalidRows + policySkippedRows
    },
    sourceRows: {
      received: payload.rows.length,
      valid: validSourceRows,
      invalid: invalidRows,
      duplicates,
      skippedByPolicy: policySkippedRows
    },
    createdRecords: {
      normalTransactions: createMany.count,
      transferLegs: totalTransfersCreated * 2,
      total: totalImported
    },
    transferReviewSuggestionsCount,
    transferReviewSuggestions,
    totalReceived: payload.rows.length,
    deterministicCategorizedCount,
    autoCreatedAccounts: {
      checking: importedCheckingAccountsAutoCreated,
      credit:
        importedCreditAccountsAutoCreated + creditInvoiceAccountsAutoCreated + cardPaymentCreditAccountsAutoCreated,
      total:
        importedCheckingAccountsAutoCreated +
        importedCreditAccountsAutoCreated +
        creditInvoiceAccountsAutoCreated +
        cardPaymentCreditAccountsAutoCreated
    },
    aiCategorizedCount: 0,
    aiUnavailableReason: payload.applyLocalAi
      ? "Categorizacao por IA local foi desativada para este fluxo. Use regras deterministicas."
      : null,
    importedRange:
      minTimestamp !== null && maxTimestamp !== null
        ? {
            from: new Date(minTimestamp).toISOString(),
            to: new Date(maxTimestamp).toISOString()
          }
        : null,
    statementReconciliation: {
      ok: statementReconciliation.ok,
      checkedAccountCount: statementReconciliation.checkedAccountCount,
      anchoredAccountCount: statementReconciliation.anchoredAccountCount,
      totalRows: statementReconciliation.totalRows,
      confirmedBalanceSnapshots: confirmedBalanceSnapshotsCreated
    },
    invoiceReconciliation: {
      ok: invoiceReconciliation.ok,
      checkedAccountCount: invoiceReconciliation.checkedAccountCount,
      mismatchCount: invoiceReconciliation.mismatchCount,
      tolerance: invoiceReconciliation.tolerance,
      accounts: invoiceReconciliation.accounts
    },
    ledgerSync,
    ledgerConsistency,
    reconciliationBacklog
  };

  console.info(
    `[IMPORT] ${JSON.stringify({
      event: "import.commit.summary",
      batchId: batch.id,
      sourceType: payload.sourceType,
      fileName: payload.fileName,
      totalReceived: payload.rows.length,
      validSourceRows,
      totalImported,
      createdRecords: result.createdRecords,
      totalSkipped,
      duplicates,
      invalidRows,
      autoCreatedAccounts: result.autoCreatedAccounts,
      statementReconciliation: result.statementReconciliation,
      invoiceReconciliation: result.invoiceReconciliation
    })}`
  );

  return result;
}

