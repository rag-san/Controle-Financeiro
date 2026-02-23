import { z } from "zod";
import { type CategorizationRule } from "@/lib/categorizationRules";
import { createImportedHash, createTransferKeyHash } from "@/lib/hash";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { categorizeImportRowDeterministic } from "@/lib/import-categorization-deterministic";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";
import { importsRepo } from "@/lib/server/imports.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export const MAX_IMPORT_COMMIT_ROWS = 5000;

const CARD_PAYMENT_STATEMENT_PATTERN =
  /PAGAMENTO\s+FATURA|PGTO\s+FATURA|PAGTO\s+FATURA|PAGAMENTO\s+CARTAO|FATURA\s+CARTAO|PAGAMENTO\s+DE\s+FATURA/i;
const CARD_PAYMENT_INVOICE_SKIP_PATTERN =
  /PAGAMENTO\s+RECEBIDO|PAGAMENTO\s+FATURA|PGTO\s+FATURA|PAGTO\s+FATURA|CREDITO\s+DE\s+PAGAMENTO/i;
const CARD_NAME_HINT_PATTERN = /CARTAO|CREDITO|CREDIT/i;

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
  amount: number;
  normalizedDescription: string;
}): boolean {
  return (
    isCheckingLikeAccount(input.accountType) &&
    input.amount < 0 &&
    CARD_PAYMENT_STATEMENT_PATTERN.test(input.normalizedDescription)
  );
}

function shouldSkipCardPaymentOnCreditImport(input: {
  accountType: UserAccount["type"];
  normalizedDescription: string;
  skipCardPaymentLines: boolean;
}): boolean {
  if (!input.skipCardPaymentLines || input.accountType !== "credit") {
    return false;
  }

  return CARD_PAYMENT_INVOICE_SKIP_PATTERN.test(input.normalizedDescription);
}

function resolveCardPaymentTargetAccountId(input: {
  row: ImportRowInput;
  fromAccount: UserAccount;
  accounts: UserAccount[];
  accountById: Map<string, UserAccount>;
  mappingCardPaymentTargetAccountId: string | null;
}): string | null {
  const explicitCandidates = [input.row.transferToAccountId, input.mappingCardPaymentTargetAccountId]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const accountId of explicitCandidates) {
    const account = input.accountById.get(accountId);
    if (account?.type === "credit") {
      return account.id;
    }
  }

  const children = input.accounts.filter(
    (account) => account.type === "credit" && account.parentAccountId === input.fromAccount.id
  );
  if (children.length === 1) {
    return children[0].id;
  }

  const institution = input.fromAccount.institution?.trim();
  if (!institution) {
    return null;
  }

  const normalizedInstitution = normalizeDescription(institution);
  const sameInstitutionCards = input.accounts.filter((account) => {
    if (account.type !== "credit") return false;
    if (account.id === input.fromAccount.id) return false;

    const accountInstitution = account.institution?.trim();
    if (!accountInstitution) return false;
    if (normalizeDescription(accountInstitution) !== normalizedInstitution) return false;

    return CARD_NAME_HINT_PATTERN.test(normalizeDescription(account.name));
  });

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
    const linkedCards = creditAccounts.filter((account) => account.parentAccountId === input.currentAccount.id);
    if (linkedCards.length === 1) {
      return linkedCards[0].id;
    }
  }

  const institution = input.currentAccount.institution?.trim();
  if (institution) {
    const normalizedInstitution = normalizeDescription(institution);
    const sameInstitutionCards = creditAccounts.filter((account) => {
      const accountInstitution = account.institution?.trim();
      if (!accountInstitution) return false;
      return normalizeDescription(accountInstitution) === normalizedInstitution;
    });

    if (sameInstitutionCards.length === 1) {
      return sameInstitutionCards[0].id;
    }
  }

  if (creditAccounts.length === 1) {
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

async function ensureCreditAccountForInvoice(input: {
  userId: string;
  row: ImportRowInput;
  currentAccount: UserAccount;
  accounts: UserAccount[];
  accountById: Map<string, UserAccount>;
  defaultAccountId?: string;
  createdByParentId: Map<string, string>;
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

  const cachedCreatedId = input.createdByParentId.get(parentCandidate.id);
  if (cachedCreatedId && input.accountById.has(cachedCreatedId)) {
    return {
      accountId: cachedCreatedId,
      autoCreated: false
    };
  }

  const linkedCards = input.accounts.filter(
    (account) => account.type === "credit" && account.parentAccountId === parentCandidate.id
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
      name: buildAutoCreditAccountName(parentCandidate),
      type: "credit",
      institution: parentCandidate.institution ?? null,
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
    input.createdByParentId.set(parentCandidate.id, createdAccount.id);

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

async function buildAccountResolver(userId: string, defaultAccountId?: string) {
  const accounts = await accountsRepo.listByUser(userId);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountNameMap = new Map(accounts.map((account) => [normalizeDescription(account.name), account.id]));

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

    if (defaultAccountId && accountById.has(defaultAccountId)) {
      return defaultAccountId;
    }

    return null;
  };

  const registerAccount = (account: UserAccount): void => {
    accounts.push(account);
    accountById.set(account.id, account);
    accountNameMap.set(normalizeDescription(account.name), account.id);
  };

  return {
    resolveAccountId,
    accounts,
    accountById,
    registerAccount
  };
}

async function loadRules(userId: string, applyRules: boolean): Promise<CategorizationRule[]> {
  if (!applyRules) {
    return [];
  }

  return (await categoryRulesRepo.listActiveByUser(userId)).map((rule) => ({
    id: rule.id,
    userId: rule.userId,
    name: rule.name,
    priority: rule.priority,
    enabled: rule.enabled,
    matchType: rule.matchType,
    pattern: rule.pattern,
    accountId: rule.accountId,
    minAmount: rule.minAmount,
    maxAmount: rule.maxAmount,
    categoryId: rule.categoryId
  }));
}

export async function commitImportForUser(userId: string, payload: ImportCommitPayload) {
  const { resolveAccountId, accounts, accountById, registerAccount } = await buildAccountResolver(
    userId,
    payload.defaultAccountId
  );
  const mappingOptions = resolveMappingOptions(payload.mapping);
  const rules = await loadRules(userId, payload.applyRules);
  const categories = await categoriesRepo.listByUser(userId);
  const categoryRefs = categories.map((item) => ({ id: item.id, name: item.name }));
  const shouldApplyDeterministic = payload.applyRules;

  let missingAccountCount = 0;
  let invalidRowCount = 0;
  let invalidDateCount = 0;
  let skippedCardPaymentLines = 0;
  let invalidTransferRowsCount = 0;
  let creditInvoiceRowsNotRouted = 0;
  let creditInvoiceRowsReassigned = 0;
  let creditInvoiceAccountsAutoCreated = 0;
  let deterministicCategorizedCount = 0;
  let totalCardPaymentsDetected = 0;
  let totalCardPaymentsNotConverted = 0;
  let totalTransfersCreated = 0;
  const warnings: string[] = [];
  let cardPaymentNotConvertedWarnings = 0;
  const autoCreatedCreditByParentId = new Map<string, string>();

  const importRows: Array<{
    userId: string;
    accountId: string;
    categoryId: string | null;
    date: Date;
    description: string;
    normalizedDescription: string;
    amount: number;
    type: "income" | "expense";
    status: "posted";
    importedHash: string;
    raw: Record<string, unknown>;
  }> = [];
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
    outImportedHash: string;
    inImportedHash: string;
    raw: Record<string, unknown>;
  }> = [];

  for (const row of payload.rows) {
    let resolvedAccountId = resolveAccountId(row);
    if (!resolvedAccountId) {
      missingAccountCount += 1;
      continue;
    }
    let resolvedAccount = accountById.get(resolvedAccountId);
    if (!resolvedAccount) {
      missingAccountCount += 1;
      continue;
    }

    if (isCreditCardInvoiceDocumentType(row.documentType) && resolvedAccount.type !== "credit") {
      const creditResolution = await ensureCreditAccountForInvoice({
        userId,
        row,
        currentAccount: resolvedAccount,
        accounts,
        accountById,
        defaultAccountId: payload.defaultAccountId,
        createdByParentId: autoCreatedCreditByParentId,
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

    if (
      shouldSkipCardPaymentOnCreditImport({
        accountType: resolvedAccount.type,
        normalizedDescription: canonical.normalizedDescription,
        skipCardPaymentLines: mappingOptions.skipCardPaymentLines
      })
    ) {
      skippedCardPaymentLines += 1;
      continue;
    }

    const wantsExplicitTransfer =
      canonical.type === "transfer" || Boolean(row.transferToAccountId) || Boolean(row.transferFromAccountId);
    const detectedCardPayment =
      mappingOptions.convertCardPaymentsToTransfer &&
      shouldDetectCardPaymentFromStatement({
        accountType: resolvedAccount.type,
        amount: canonical.amount,
        normalizedDescription: canonical.normalizedDescription
      });

    if (detectedCardPayment) {
      totalCardPaymentsDetected += 1;
    }

    if (wantsExplicitTransfer || detectedCardPayment) {
      const fromAccountId = row.transferFromAccountId?.trim() || resolvedAccountId;
      const fromAccount = accountById.get(fromAccountId);

      if (!fromAccount) {
        invalidRowCount += 1;
        invalidTransferRowsCount += 1;
        continue;
      }

      let toAccountId = row.transferToAccountId?.trim() || null;

      if (!toAccountId && detectedCardPayment) {
        toAccountId = resolveCardPaymentTargetAccountId({
          row,
          fromAccount,
          accounts,
          accountById,
          mappingCardPaymentTargetAccountId: mappingOptions.cardPaymentTargetAccountId
        });
      }

      if (detectedCardPayment) {
        const cardTarget = toAccountId ? accountById.get(toAccountId) : null;
        if (!cardTarget || cardTarget.type !== "credit") {
          totalCardPaymentsNotConverted += 1;
          cardPaymentNotConvertedWarnings += 1;
          toAccountId = null;
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

        const transferHashBase = createTransferKeyHash({
          userId,
          date: canonical.date,
          amount: canonical.amount,
          normalizedDescription: canonical.normalizedDescription,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          externalId: row.externalId
        });

        transferRows.push({
          userId,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          date: canonical.date,
          description: canonical.description,
          normalizedDescription: canonical.normalizedDescription,
          amount: canonical.amount,
          status: "posted",
          transferHashBase,
          outImportedHash: `${transferHashBase}:OUT`,
          inImportedHash: `${transferHashBase}:IN`,
          raw: {
            ...(row.raw ?? {}),
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
    }

    const canonicalType =
      canonical.type === "transfer" ? (canonical.amount >= 0 ? "income" : "expense") : canonical.type;

    const deterministic = shouldApplyDeterministic
      ? categorizeImportRowDeterministic({
          row: canonical,
          accountId: resolvedAccountId,
          userRules: rules,
          categories: categoryRefs
        })
      : {
          categoryId: null,
          categorySource: "none" as const,
          matchedRule: null
        };

    const categoryId = row.categoryId ?? deterministic.categoryId;
    if (!row.categoryId && deterministic.categoryId) {
      deterministicCategorizedCount += 1;
    }

    const importedHash = createImportedHash({
      userId,
      sourceType: payload.sourceType,
      date: canonical.date,
      amount: canonical.amount,
      normalizedDescription: canonical.normalizedDescription,
      accountId: resolvedAccountId,
      externalId: row.externalId
    });

    importRows.push({
      userId,
      accountId: resolvedAccountId,
      categoryId,
      date: canonical.date,
      description: canonical.description,
      normalizedDescription: canonical.normalizedDescription,
      amount: canonical.amount,
      type: canonicalType,
      status: "posted",
      importedHash,
      raw: {
        ...(row.raw ?? {}),
        balanceAfter: canonical.balanceAfter ?? null,
        transactionKindRaw: canonical.transactionKindRaw,
        counterpartyRaw: canonical.counterpartyRaw,
        transactionKindNorm: canonical.transactionKindNorm,
        counterpartyNorm: canonical.counterpartyNorm,
        merchantKey: canonical.merchantKey,
        sourceType: canonical.sourceType,
        documentType: canonical.documentType ?? null,
        categorySource: row.categoryId ? "manual" : deterministic.categorySource,
        matchedRule: row.categoryId ? null : deterministic.matchedRule
      }
    });
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

  const importedHashes = [
    ...importRows.map((row) => row.importedHash),
    ...transferRows.flatMap((row) => [row.outImportedHash, row.inImportedHash])
  ];
  const existingHashes = new Set(await transactionsRepo.findImportedHashes(userId, importedHashes));
  const seenInBatch = new Set<string>();
  let duplicateInDatabaseCount = 0;
  let duplicateInPayloadCount = 0;

  const rowsToCreate = importRows.filter((row) => {
    if (existingHashes.has(row.importedHash)) {
      duplicateInDatabaseCount += 1;
      return false;
    }
    if (seenInBatch.has(row.importedHash)) {
      duplicateInPayloadCount += 1;
      return false;
    }
    seenInBatch.add(row.importedHash);
    return true;
  });

  const transferRowsToCreate = transferRows.filter((row) => {
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

    seenInBatch.add(row.outImportedHash);
    seenInBatch.add(row.inImportedHash);
    return true;
  });

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
      importBatchId: batch.id,
      importedHashBase: row.transferHashBase,
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
  const duplicates = duplicateInDatabaseCount + duplicateInPayloadCount;
  const invalidRows = missingAccountCount + invalidRowCount;
  const policySkippedRows = skippedCardPaymentLines;
  const totalSkipped = duplicates + invalidRows + policySkippedRows;

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

  return {
    batchId: batch.id,
    totalImported,
    totalSkipped,
    duplicates,
    invalidRows,
    totalTransfersCreated,
    totalCardPaymentsDetected,
    totalCardPaymentsNotConverted,
    warnings: [
      ...(cardPaymentNotConvertedWarnings > 0
        ? [
            `${cardPaymentNotConvertedWarnings} pagamento(s) de fatura nao foram convertidos por falta de conta destino unica.`
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
            `${creditInvoiceRowsNotRouted} linha(s) de fatura nao foram importadas porque nao foi possivel definir a conta de cartao de credito.`
          ]
        : []),
      ...(creditInvoiceRowsReassigned > 0
        ? [`${creditInvoiceRowsReassigned} linha(s) de fatura foram direcionadas automaticamente para conta de cartao.`]
        : []),
      ...(creditInvoiceAccountsAutoCreated > 0
        ? [
            `${creditInvoiceAccountsAutoCreated} conta(s) de cartao foram criadas automaticamente a partir da conta bancaria vinculada.`
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
    totalReceived: payload.rows.length,
    deterministicCategorizedCount,
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
        : null
  };
}
