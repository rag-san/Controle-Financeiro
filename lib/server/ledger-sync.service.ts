import { db } from "@/lib/db";
import {
  buildFingerprint,
  normalizeAmountCents,
  normalizeOptionalText,
  normalizeText,
  type LedgerDirection,
  type LedgerEntryType
} from "@/lib/ledger/normalization";
import { nowIso } from "@/lib/server/sql";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

type ImportSourceKind = "BANK_STATEMENT" | "CC_STATEMENT";

type LegacyImportedTransaction = Awaited<
  ReturnType<typeof transactionsRepo.listByImportBatch>
>[number];
type LegacyTransactionRecord =
  | LegacyImportedTransaction
  | NonNullable<Awaited<ReturnType<typeof transactionsRepo.findByIdForUser>>>;
type ReconciliationStatus = "matched" | "unmatched" | "suggested";

function normalizeExternalRef(transactionId: string): string {
  return `LEGACY_TX:${transactionId}`;
}

function directionFromLegacy(value: "in" | "out" | undefined, amount: number): LedgerDirection {
  if (value === "in") return "IN";
  if (value === "out") return "OUT";
  return amount >= 0 ? "IN" : "OUT";
}

function toLedgerType(input: {
  transaction: LegacyTransactionRecord;
  direction: LedgerDirection;
  isCardPaymentTransfer: boolean;
}): LedgerEntryType | null {
  const accountType = input.transaction.account.type;
  const legacyType = input.transaction.type;

  if (legacyType === "transfer") {
    if (accountType === "credit") {
      return null;
    }
    if (input.isCardPaymentTransfer && input.direction === "OUT") {
      return "cc_payment";
    }
    return "transfer";
  }

  if (legacyType === "income") {
    return accountType === "credit" ? "refund" : "income";
  }

  if (legacyType === "expense") {
    return accountType === "credit" ? "cc_purchase" : "expense";
  }

  return null;
}

async function ensureInstitutionId(
  institutionName: string | null | undefined,
  cache: Map<string, string | null>
): Promise<string | null> {
  const normalizedName = institutionName?.trim() ?? "";
  if (!normalizedName) {
    return null;
  }

  const key = normalizeText(normalizedName);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  const institution = await ledgerRepo.findOrCreateInstitution({ name: normalizedName });
  cache.set(key, institution.id);
  return institution.id;
}

async function ensureCreditCardMirrorAccount(input: {
  userId: string;
  legacyAccountId: string;
  name: string;
  currency: string;
  institutionId: string | null;
  defaultPaymentAccountId: string | null;
}): Promise<string> {
  const existing = await ledgerRepo.findCreditCardAccountById(input.userId, input.legacyAccountId);
  if (existing) {
    return existing.id;
  }

  const now = nowIso();
  await db.prepare(
    `INSERT INTO credit_card_accounts (
       id, user_id, institution_id, name, currency, closing_day, due_day, default_payment_account_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
     ON CONFLICT (id)
     DO UPDATE SET
       institution_id = EXCLUDED.institution_id,
       name = EXCLUDED.name,
       currency = EXCLUDED.currency,
       default_payment_account_id = EXCLUDED.default_payment_account_id,
       updated_at = EXCLUDED.updated_at`
  ).run(
    input.legacyAccountId,
    input.userId,
    input.institutionId,
    input.name,
    input.currency.toUpperCase(),
    input.defaultPaymentAccountId,
    now,
    now
  );

  return input.legacyAccountId;
}

function resolveImportSourceKind(type: LedgerEntryType): ImportSourceKind {
  if (type === "cc_purchase" || type === "refund") {
    return "CC_STATEMENT";
  }
  return "BANK_STATEMENT";
}

function readRawBoolean(
  raw: Record<string, unknown> | null | undefined,
  key: string
): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  return raw[key] === true;
}

function readRawString(raw: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePaymentDescription(description: string, cardName: string | null): string {
  if (!cardName?.trim()) {
    return normalizeText(description);
  }
  return normalizeText(`PAGAMENTO FATURA ${cardName}`);
}

type LegacyLedgerCandidate = {
  externalRef: string;
  postedAt: Date;
  amount: number;
  amountCents: number;
  direction: LedgerDirection;
  type: LedgerEntryType;
  descriptionNormalized: string;
  merchantNormalized: string | null;
  accountId: string | null;
  creditCardAccountId: string | null;
  categoryId: string | null;
  institutionId: string | null;
  fingerprint: string;
  transferGroupId: string | null;
  reconciliationStatus: ReconciliationStatus;
};

type LegacyCreditAccountRow = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  institution: string | null;
  parent_account_id: string | null;
};

async function findLegacyCreditAccount(
  userId: string,
  accountId: string
): Promise<LegacyCreditAccountRow | null> {
  const row = (await db
    .prepare(
      `SELECT id, user_id, name, currency, institution, parent_account_id
       FROM accounts
       WHERE id = ? AND user_id = ? AND type = 'credit'
       LIMIT 1`
    )
    .get(accountId, userId)) as LegacyCreditAccountRow | undefined;

  return row ?? null;
}

async function resolveLegacyLedgerCandidate(input: {
  userId: string;
  transaction: LegacyTransactionRecord;
  institutionCache: Map<string, string | null>;
}): Promise<LegacyLedgerCandidate | null> {
  const direction = directionFromLegacy(input.transaction.direction, input.transaction.amount);
  const raw = input.transaction.raw as Record<string, unknown> | null;
  const isCardPaymentTransfer = readRawBoolean(raw, "transferDetectedFromCardPayment");
  const resolvedType = toLedgerType({
    transaction: input.transaction,
    direction,
    isCardPaymentTransfer
  });

  if (!resolvedType) {
    return null;
  }

  const externalRef = normalizeExternalRef(input.transaction.id);
  const institutionId = await ensureInstitutionId(
    input.transaction.account.institution ?? null,
    input.institutionCache
  );

  let accountId: string | null = null;
  let creditCardAccountId: string | null = null;

  if (resolvedType === "income" || resolvedType === "expense" || resolvedType === "transfer") {
    accountId = input.transaction.accountId;
  }

  if (resolvedType === "cc_purchase" || resolvedType === "refund") {
    creditCardAccountId = await ensureCreditCardMirrorAccount({
      userId: input.userId,
      legacyAccountId: input.transaction.accountId,
      name: input.transaction.account.name,
      currency: input.transaction.account.currency,
      institutionId,
      defaultPaymentAccountId: input.transaction.account.parentAccountId ?? null
    });
  }

  if (resolvedType === "cc_payment") {
    const candidateLegacyCardId = input.transaction.transferToAccountId?.trim() || null;
    if (candidateLegacyCardId) {
      const targetCard = await findLegacyCreditAccount(input.userId, candidateLegacyCardId);
      if (targetCard) {
        const cardInstitutionId = await ensureInstitutionId(targetCard.institution, input.institutionCache);
        creditCardAccountId = await ensureCreditCardMirrorAccount({
          userId: input.userId,
          legacyAccountId: targetCard.id,
          name: targetCard.name,
          currency: targetCard.currency,
          institutionId: cardInstitutionId,
          defaultPaymentAccountId: targetCard.parent_account_id
        });
      }
    }

    accountId = input.transaction.accountId;
  }

  const postedAt = input.transaction.date;
  const amount = Math.abs(input.transaction.amount);
  const amountCents = normalizeAmountCents(amount);
  const merchantNormalized = normalizeOptionalText(
    readRawString(raw, "merchantKey") ?? readRawString(raw, "counterpartyRaw")
  );
  const cardNameForPayment =
    resolvedType === "cc_payment" && creditCardAccountId
      ? (await ledgerRepo.findCreditCardAccountById(input.userId, creditCardAccountId))?.name ?? null
      : null;
  const descriptionNormalized =
    resolvedType === "cc_payment"
      ? normalizePaymentDescription(input.transaction.description, cardNameForPayment)
      : normalizeText(input.transaction.description);

  const fingerprint = buildFingerprint({
    postedAt,
    amountCents,
    type: resolvedType,
    direction,
    descriptionNormalized,
    merchantNormalized,
    accountId,
    creditCardAccountId,
    institutionId
  });

  const reconciliationStatus =
    resolvedType === "cc_payment" && !creditCardAccountId
      ? "unmatched"
      : resolvedType === "transfer" ||
          resolvedType === "cc_purchase" ||
          resolvedType === "refund" ||
          resolvedType === "cc_payment"
        ? "matched"
        : "unmatched";

  return {
    externalRef,
    postedAt,
    amount,
    amountCents,
    direction,
    type: resolvedType,
    descriptionNormalized,
    merchantNormalized,
    accountId,
    creditCardAccountId,
    categoryId:
      resolvedType === "income" || resolvedType === "expense" ? input.transaction.categoryId ?? null : null,
    institutionId,
    fingerprint,
    transferGroupId: input.transaction.transferGroupId ?? null,
    reconciliationStatus
  };
}

function isSameCandidateAsEntry(input: {
  existing: Awaited<ReturnType<typeof ledgerRepo.findLedgerEntryByExternalRef>>;
  candidate: LegacyLedgerCandidate;
}): boolean {
  if (!input.existing) {
    return false;
  }

  return (
    input.existing.fingerprint === input.candidate.fingerprint &&
    input.existing.type === input.candidate.type &&
    input.existing.direction === input.candidate.direction &&
    input.existing.amountCents === input.candidate.amountCents &&
    input.existing.descriptionNormalized === input.candidate.descriptionNormalized &&
    (input.existing.merchantNormalized ?? null) === (input.candidate.merchantNormalized ?? null) &&
    (input.existing.accountId ?? null) === (input.candidate.accountId ?? null) &&
    (input.existing.creditCardAccountId ?? null) === (input.candidate.creditCardAccountId ?? null) &&
    (input.existing.categoryId ?? null) === (input.candidate.categoryId ?? null) &&
    (input.existing.transferGroupId ?? null) === (input.candidate.transferGroupId ?? null) &&
    input.existing.reconciliationStatus === input.candidate.reconciliationStatus &&
    input.existing.postedAt.toISOString() === input.candidate.postedAt.toISOString()
  );
}

export async function syncLedgerFromImportBatch(input: {
  userId: string;
  importBatchId: string;
  fileName: string;
}): Promise<{
  processed: number;
  created: number;
  deduped: number;
  skipped: number;
}> {
  const transactions = await transactionsRepo.listByImportBatch(input.userId, input.importBatchId);
  if (transactions.length === 0) {
    return {
      processed: 0,
      created: 0,
      deduped: 0,
      skipped: 0
    };
  }

  const institutionCache = new Map<string, string | null>();
  const sourceCache = new Map<string, string>();

  let created = 0;
  let deduped = 0;
  let skipped = 0;

  for (const transaction of transactions) {
    const direction = directionFromLegacy(transaction.direction, transaction.amount);
    const raw = transaction.raw as Record<string, unknown> | null;
    const isCardPaymentTransfer = readRawBoolean(raw, "transferDetectedFromCardPayment");
    const resolvedType = toLedgerType({
      transaction,
      direction,
      isCardPaymentTransfer
    });

    if (!resolvedType) {
      skipped += 1;
      continue;
    }

    const externalRef = normalizeExternalRef(transaction.id);
    const existingByExternalRef = await ledgerRepo.findLedgerEntryByExternalRef(input.userId, externalRef);
    if (existingByExternalRef) {
      deduped += 1;
      continue;
    }

    const institutionId = await ensureInstitutionId(transaction.account.institution ?? null, institutionCache);

    let accountId: string | null = null;
    let creditCardAccountId: string | null = null;

    if (resolvedType === "income" || resolvedType === "expense" || resolvedType === "transfer") {
      accountId = transaction.accountId;
    }

    if (resolvedType === "cc_purchase" || resolvedType === "refund") {
      creditCardAccountId = await ensureCreditCardMirrorAccount({
        userId: input.userId,
        legacyAccountId: transaction.accountId,
        name: transaction.account.name,
        currency: transaction.account.currency,
        institutionId,
        defaultPaymentAccountId: transaction.account.parentAccountId ?? null
      });
    }

    if (resolvedType === "cc_payment") {
      const candidateLegacyCardId = transaction.transferToAccountId?.trim() || null;
      if (candidateLegacyCardId) {
        const targetCard = await db
          .prepare(
            `SELECT id, user_id, name, currency, institution, parent_account_id
             FROM accounts
             WHERE id = ? AND user_id = ? AND type = 'credit'
             LIMIT 1`
          )
          .get(candidateLegacyCardId, input.userId) as
          | {
              id: string;
              user_id: string;
              name: string;
              currency: string;
              institution: string | null;
              parent_account_id: string | null;
            }
          | undefined;

        if (targetCard) {
          const cardInstitutionId = await ensureInstitutionId(targetCard.institution, institutionCache);
          creditCardAccountId = await ensureCreditCardMirrorAccount({
            userId: input.userId,
            legacyAccountId: targetCard.id,
            name: targetCard.name,
            currency: targetCard.currency,
            institutionId: cardInstitutionId,
            defaultPaymentAccountId: targetCard.parent_account_id
          });
        }
      }
      accountId = transaction.accountId;
    }

    const kind = resolveImportSourceKind(resolvedType);
    const sourceKey = `${kind}|${institutionId ?? "none"}`;
    let importSourceId = sourceCache.get(sourceKey) ?? null;

    if (!importSourceId) {
      const source = await ledgerRepo.upsertImportSource({
        userId: input.userId,
        institutionId,
        kind,
        filename: input.fileName,
        fileHash: `LEGACY_IMPORT_BATCH:${input.importBatchId}:${sourceKey}`
      });
      importSourceId = source.source.id;
      sourceCache.set(sourceKey, importSourceId);
    }

    const postedAt = transaction.date;
    const amount = Math.abs(transaction.amount);
    const amountCents = normalizeAmountCents(amount);
    const merchantNormalized = normalizeOptionalText(
      readRawString(raw, "merchantKey") ?? readRawString(raw, "counterpartyRaw")
    );
    const cardNameForPayment =
      resolvedType === "cc_payment" && creditCardAccountId
        ? (
            await ledgerRepo.findCreditCardAccountById(input.userId, creditCardAccountId)
          )?.name ?? null
        : null;
    const descriptionNormalized =
      resolvedType === "cc_payment"
        ? normalizePaymentDescription(transaction.description, cardNameForPayment)
        : normalizeText(transaction.description);

    const fingerprint = buildFingerprint({
      postedAt,
      amountCents,
      type: resolvedType,
      direction,
      descriptionNormalized,
      merchantNormalized,
      accountId,
      creditCardAccountId,
      institutionId
    });

    const rawTransactionId = await ledgerRepo.insertRawTransaction({
      importSourceId,
      rawExternalId: transaction.externalId ?? externalRef,
      postedAt,
      amount,
      direction,
      descriptionRaw: transaction.description,
      meta: raw
    });

    const result = await ledgerRepo.upsertLedgerEntry({
      userId: input.userId,
      postedAt,
      amount,
      direction,
      type: resolvedType,
      descriptionNormalized,
      merchantNormalized,
      accountId,
      creditCardAccountId,
      categoryId: resolvedType === "income" || resolvedType === "expense" ? transaction.categoryId : null,
      importSourceId,
      rawTransactionId,
      externalRef,
      fingerprint,
      transferGroupId: transaction.transferGroupId ?? null,
      reconciliationStatus:
        resolvedType === "cc_payment" && !creditCardAccountId
          ? "unmatched"
          : resolvedType === "transfer" || resolvedType === "cc_purchase" || resolvedType === "refund" || resolvedType === "cc_payment"
            ? "matched"
            : "unmatched"
    });

    if (result.created) {
      created += 1;
    } else {
      deduped += 1;
    }
  }

  return {
    processed: transactions.length,
    created,
    deduped,
    skipped
  };
}

export async function deleteLedgerForLegacyTransactions(input: {
  userId: string;
  transactionIds: string[];
}): Promise<{
  requested: number;
  deleted: number;
}> {
  const ids = [
    ...new Set(
      input.transactionIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ];

  if (ids.length === 0) {
    return {
      requested: 0,
      deleted: 0
    };
  }

  const externalRefs = ids.map(normalizeExternalRef);
  const deleted = await ledgerRepo.deleteEntriesByExternalRefs(input.userId, externalRefs);

  return {
    requested: ids.length,
    deleted
  };
}

export async function syncLedgerForLegacyTransactions(input: {
  userId: string;
  transactionIds: string[];
}): Promise<{
  processed: number;
  created: number;
  deduped: number;
  deleted: number;
  skipped: number;
  missing: number;
}> {
  const ids = [
    ...new Set(
      input.transactionIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ];

  if (ids.length === 0) {
    return {
      processed: 0,
      created: 0,
      deduped: 0,
      deleted: 0,
      skipped: 0,
      missing: 0
    };
  }

  const institutionCache = new Map<string, string | null>();
  let created = 0;
  let deduped = 0;
  let deleted = 0;
  let skipped = 0;
  let missing = 0;

  for (const transactionId of ids) {
    const externalRef = normalizeExternalRef(transactionId);
    const existingByExternalRef = await ledgerRepo.findLedgerEntryByExternalRef(input.userId, externalRef);
    const transaction = await transactionsRepo.findByIdForUser(transactionId, input.userId);

    if (!transaction) {
      if (existingByExternalRef) {
        deleted += await ledgerRepo.deleteEntriesByExternalRefs(input.userId, [externalRef]);
      }
      missing += 1;
      continue;
    }

    const candidate = await resolveLegacyLedgerCandidate({
      userId: input.userId,
      transaction,
      institutionCache
    });

    if (!candidate) {
      if (existingByExternalRef) {
        deleted += await ledgerRepo.deleteEntriesByExternalRefs(input.userId, [externalRef]);
      }
      skipped += 1;
      continue;
    }

    if (isSameCandidateAsEntry({ existing: existingByExternalRef, candidate })) {
      deduped += 1;
      continue;
    }

    if (existingByExternalRef) {
      deleted += await ledgerRepo.deleteEntriesByExternalRefs(input.userId, [externalRef]);
    }

    const result = await ledgerRepo.upsertLedgerEntry({
      userId: input.userId,
      postedAt: candidate.postedAt,
      amount: candidate.amount,
      direction: candidate.direction,
      type: candidate.type,
      descriptionNormalized: candidate.descriptionNormalized,
      merchantNormalized: candidate.merchantNormalized,
      accountId: candidate.accountId,
      creditCardAccountId: candidate.creditCardAccountId,
      categoryId: candidate.categoryId,
      importSourceId: null,
      rawTransactionId: null,
      externalRef: candidate.externalRef,
      fingerprint: candidate.fingerprint,
      transferGroupId: candidate.transferGroupId,
      reconciliationStatus: candidate.reconciliationStatus
    });

    if (result.created) {
      created += 1;
      continue;
    }

    await ledgerRepo.attachExternalRefIfMissing({
      userId: input.userId,
      entryId: result.entry.id,
      externalRef: candidate.externalRef
    });
    deduped += 1;
  }

  return {
    processed: ids.length,
    created,
    deduped,
    deleted,
    skipped,
    missing
  };
}
