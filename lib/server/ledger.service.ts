import { addDays, subDays } from "date-fns";
import { createId } from "@/lib/db";
import { db } from "@/lib/db";
import {
  buildFingerprint,
  buildImportFileHash,
  normalizeAmountCents,
  normalizeOptionalText,
  normalizeText,
  type LedgerDirection,
  type LedgerEntryType
} from "@/lib/ledger/normalization";
import { ledgerRepo } from "@/lib/server/ledger.repo";

const CARD_PAYMENT_KEYWORDS = [
  "PAGAMENTO FATURA",
  "PGTO FATURA",
  "PAGTO FATURA",
  "FATURA CARTAO",
  "FATURA CART",
  "PAG CARTAO",
  "PAG CART",
  "CREDIT CARD PAYMENT"
];

const TRANSFER_KEYWORDS = ["PIX", "TED", "DOC", "TRANSFER", "TRANSF", "ENVIADO", "RECEBIDO"];
const REFUND_KEYWORDS = ["ESTORNO", "REFUND", "REVERSAL", "CANCELAMENTO"];
const FEE_TOLERANCE_CENTS = 150;
const TRANSFER_AUTO_THRESHOLD = 0.82;
const TRANSFER_SUGGESTION_THRESHOLD = 0.62;

type ImportSourceKind = "BANK_STATEMENT" | "CC_STATEMENT";
type ReconciliationStatus = "matched" | "unmatched" | "suggested";

type ImportRowInput = {
  postedAt: string | Date;
  amount: number;
  direction?: "IN" | "OUT" | "in" | "out";
  description: string;
  externalId?: string;
  merchant?: string;
  accountId?: string;
  creditCardAccountId?: string;
  categoryId?: string | null;
  type?: LedgerEntryType;
  meta?: Record<string, unknown> | null;
};

function parsePostedAt(value: string | Date): Date {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error("LEDGER_INVALID_DATE");
    }
    return value;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("LEDGER_INVALID_DATE");
  }
  return parsed;
}

function normalizeDirection(input: ImportRowInput): LedgerDirection {
  if (input.direction) {
    return String(input.direction).toUpperCase() === "IN" ? "IN" : "OUT";
  }

  return input.amount >= 0 ? "IN" : "OUT";
}

function isCardPaymentDescription(normalizedDescription: string): boolean {
  if (CARD_PAYMENT_KEYWORDS.some((keyword) => normalizedDescription.includes(keyword))) {
    return true;
  }

  const hasFatura = normalizedDescription.includes("FATURA");
  const hasPaymentHint = /\b(?:PAGAMENTO|PAGTO|PGTO|PAG)\b/.test(normalizedDescription);
  const hasCardHint = /\bCART[A-Z]*\b/.test(normalizedDescription);
  return hasFatura && (hasPaymentHint || hasCardHint);
}

function containsTransferKeyword(normalizedDescription: string): boolean {
  return TRANSFER_KEYWORDS.some((keyword) => normalizedDescription.includes(keyword));
}

function containsTedOrDoc(normalizedDescription: string): boolean {
  return normalizedDescription.includes("TED") || normalizedDescription.includes("DOC");
}

function resolveLedgerType(input: {
  kind: ImportSourceKind;
  normalizedDescription: string;
  direction: LedgerDirection;
  hintType?: LedgerEntryType;
}): LedgerEntryType | null {
  if (input.hintType) {
    return input.hintType;
  }

  if (input.kind === "CC_STATEMENT") {
    if (isCardPaymentDescription(input.normalizedDescription) && input.direction === "IN") {
      return null;
    }

    if (
      input.direction === "IN" &&
      REFUND_KEYWORDS.some((keyword) => input.normalizedDescription.includes(keyword))
    ) {
      return "refund";
    }

    if (input.direction === "IN") {
      return "refund";
    }

    return "cc_purchase";
  }

  if (input.direction === "OUT" && isCardPaymentDescription(input.normalizedDescription)) {
    return "cc_payment";
  }

  return input.direction === "IN" ? "income" : "expense";
}

async function inferCreditCardForPayment(input: {
  userId: string;
  accountId: string;
  institutionId?: string | null;
  amountCents: number;
  postedAt: Date;
}): Promise<string | null> {
  const cards = await ledgerRepo.listCreditCardAccounts(input.userId);
  if (cards.length === 0) return null;

  const lookbackFrom = subDays(input.postedAt, 45);
  const lookbackTo = addDays(input.postedAt, 2);
  let best: { id: string; score: number } | null = null;
  let secondScore = -Infinity;

  for (const card of cards) {
    let score = 0;
    if (card.defaultPaymentAccountId === input.accountId) {
      score += 5;
    }
    if (input.institutionId && card.institutionId === input.institutionId) {
      score += 2;
    }

    if (card.dueDay !== null) {
      const paymentDay = input.postedAt.getUTCDate();
      const distance = Math.abs(paymentDay - card.dueDay);
      if (distance <= 4) {
        score += 1;
      }
    }

    const debtCents = await ledgerRepo.listRecentCardPurchases({
      userId: input.userId,
      creditCardAccountId: card.id,
      from: lookbackFrom,
      to: lookbackTo
    });

    const debtDiff = Math.abs(debtCents - input.amountCents);
    if (debtDiff <= 50) {
      score += 3;
    } else if (debtDiff <= 300) {
      score += 1;
    }

    if (!best || score > best.score) {
      secondScore = best?.score ?? -Infinity;
      best = { id: card.id, score };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best) return null;
  const margin = best.score - (Number.isFinite(secondScore) ? secondScore : -Infinity);
  if (best.score < 5) return null;
  if (Number.isFinite(secondScore) && margin < 1.5) return null;
  return best.id;
}

function amountSimilarity(outAmountCents: number, inAmountCents: number): number {
  const diff = Math.abs(outAmountCents - inAmountCents);
  if (diff === 0) return 1;
  if (diff > FEE_TOLERANCE_CENTS) return 0;
  return Number(Math.max(0, 1 - diff / (FEE_TOLERANCE_CENTS * 1.1)).toFixed(4));
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function textSimilarity(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  if (union <= 0) return 0;
  return Number((intersection / union).toFixed(4));
}

function buildTransferDescription(fromName: string, toName: string): string {
  return `TRANSFER: ${fromName} -> ${toName}`;
}

async function resolveAccountNames(userId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = [...new Set(ids)];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = (await db
    .prepare(
      `SELECT id, name
       FROM accounts
       WHERE user_id = ? AND id IN (${placeholders})`
    )
    .all(userId, ...uniqueIds)) as Array<{ id: string; name: string }>;
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function importLedgerForUser(
  userId: string,
  input: {
    institutionId?: string | null;
    institutionName?: string;
    kind: ImportSourceKind;
    filename: string;
    fileHash?: string;
    defaultAccountId?: string;
    defaultCreditCardAccountId?: string;
    rows: ImportRowInput[];
  }
): Promise<{
  importSourceId: string;
  duplicateImportSource: boolean;
  imported: number;
  deduped: number;
  skipped: number;
}> {
  let institutionId = input.institutionId ?? null;
  if (!institutionId && input.institutionName?.trim()) {
    const institution = await ledgerRepo.findOrCreateInstitution({
      name: input.institutionName.trim()
    });
    institutionId = institution.id;
  }

  const canonicalRows = JSON.stringify(
    input.rows.map((row) => ({
      postedAt: new Date(row.postedAt).toISOString().slice(0, 10),
      amount: Number(row.amount.toFixed(2)),
      direction: row.direction ? String(row.direction).toUpperCase() : null,
      description: normalizeText(row.description),
      externalId: row.externalId?.trim().toUpperCase() || null
    }))
  );
  const fileHash =
    input.fileHash?.trim() ||
    buildImportFileHash({
      filename: input.filename,
      kind: input.kind,
      canonicalRows
    });

  const sourceUpsert = await ledgerRepo.upsertImportSource({
    userId,
    institutionId,
    kind: input.kind,
    filename: input.filename,
    fileHash
  });

  if (sourceUpsert.duplicate) {
    return {
      importSourceId: sourceUpsert.source.id,
      duplicateImportSource: true,
      imported: 0,
      deduped: 0,
      skipped: input.rows.length
    };
  }

  let imported = 0;
  let deduped = 0;
  let skipped = 0;

  for (const row of input.rows) {
    const postedAt = parsePostedAt(row.postedAt);
    const direction = normalizeDirection(row);
    const normalizedDescription = normalizeText(row.description);
    const merchantNormalized = normalizeOptionalText(row.merchant);
    const amountCents = normalizeAmountCents(row.amount);
    const resolvedType = resolveLedgerType({
      kind: input.kind,
      normalizedDescription,
      direction,
      hintType: row.type
    });

    if (!resolvedType) {
      skipped += 1;
      continue;
    }

    const accountId = row.accountId?.trim() || input.defaultAccountId?.trim() || null;
    const rowCardId = row.creditCardAccountId?.trim() || input.defaultCreditCardAccountId?.trim() || null;
    let creditCardAccountId = rowCardId;
    let reconciliationStatus: ReconciliationStatus = "unmatched";

    if (input.kind === "CC_STATEMENT" && !creditCardAccountId) {
      skipped += 1;
      continue;
    }

    if ((resolvedType === "income" || resolvedType === "expense" || resolvedType === "cc_payment") && !accountId) {
      skipped += 1;
      continue;
    }

    if (resolvedType === "cc_payment" && !creditCardAccountId && accountId) {
      creditCardAccountId = await inferCreditCardForPayment({
        userId,
        accountId,
        institutionId,
        amountCents,
        postedAt
      });
      reconciliationStatus = creditCardAccountId ? "matched" : "unmatched";
    } else if (resolvedType === "cc_purchase" || resolvedType === "refund") {
      reconciliationStatus = "matched";
    }

    const rawTransactionId = await ledgerRepo.insertRawTransaction({
      importSourceId: sourceUpsert.source.id,
      rawExternalId: row.externalId ?? null,
      postedAt,
      amount: Math.abs(row.amount),
      direction,
      descriptionRaw: row.description,
      meta: row.meta ?? null
    });

    const fingerprint = buildFingerprint({
      postedAt,
      amountCents,
      type: resolvedType,
      direction,
      descriptionNormalized: normalizedDescription,
      merchantNormalized,
      accountId,
      creditCardAccountId,
      institutionId
    });

    const result = await ledgerRepo.upsertLedgerEntry({
      userId,
      postedAt,
      amount: Math.abs(row.amount),
      direction,
      type: resolvedType,
      descriptionNormalized: normalizedDescription,
      merchantNormalized,
      accountId,
      creditCardAccountId,
      categoryId: row.categoryId ?? null,
      importSourceId: sourceUpsert.source.id,
      rawTransactionId,
      externalRef: row.externalId?.trim() || null,
      fingerprint,
      reconciliationStatus
    });

    if (result.created) {
      imported += 1;
    } else {
      deduped += 1;
    }
  }

  return {
    importSourceId: sourceUpsert.source.id,
    duplicateImportSource: false,
    imported,
    deduped,
    skipped
  };
}

type TransferCandidate = Awaited<ReturnType<typeof ledgerRepo.listLedgerEntriesForTransferMatcher>>[number];

function computeTransferScore(outEntry: TransferCandidate, inEntry: TransferCandidate): {
  score: number;
  amountDiffCents: number;
  maxDays: number;
} {
  const amountDiffCents = Math.abs(outEntry.amountCents - inEntry.amountCents);
  const amountScore = amountSimilarity(outEntry.amountCents, inEntry.amountCents);
  if (amountScore <= 0) {
    return {
      score: 0,
      amountDiffCents,
      maxDays: 0
    };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const dateDiffMs = Math.abs(outEntry.postedAt.getTime() - inEntry.postedAt.getTime());
  const leftDesc = outEntry.descriptionNormalized;
  const rightDesc = inEntry.descriptionNormalized;

  const maxDays = containsTedOrDoc(leftDesc) || containsTedOrDoc(rightDesc) ? 3 : 1;
  if (dateDiffMs > maxDays * msPerDay) {
    return {
      score: 0,
      amountDiffCents,
      maxDays
    };
  }

  const dateScore = Number(Math.max(0, 1 - dateDiffMs / (maxDays * msPerDay + 1)).toFixed(4));
  const keywordScore =
    containsTransferKeyword(leftDesc) || containsTransferKeyword(rightDesc) ? 1 : 0.45;
  const similarity = textSimilarity(leftDesc, rightDesc);

  let penalty = 0;
  if (
    outEntry.merchantNormalized &&
    inEntry.merchantNormalized &&
    outEntry.merchantNormalized !== inEntry.merchantNormalized
  ) {
    penalty = 0.08;
  }

  const score = amountScore * 0.55 + dateScore * 0.25 + keywordScore * 0.1 + similarity * 0.1 - penalty;
  return {
    score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
    amountDiffCents,
    maxDays
  };
}

export async function runTransferMatcherForUser(input: {
  userId: string;
  from?: Date;
  to?: Date;
}): Promise<{
  matched: number;
  suggested: number;
  ignored: number;
}> {
  const candidates = await ledgerRepo.listLedgerEntriesForTransferMatcher({
    userId: input.userId,
    from: input.from,
    to: input.to
  });

  const outEntries = candidates.filter((item) => item.direction === "OUT");
  const inEntries = candidates.filter((item) => item.direction === "IN");
  const used = new Set<string>();
  let matched = 0;
  let suggested = 0;

  const accountNameMap = await resolveAccountNames(
    input.userId,
    candidates.map((item) => item.accountId).filter((value): value is string => Boolean(value))
  );

  for (const outEntry of outEntries) {
    if (used.has(outEntry.id)) continue;
    if (isCardPaymentDescription(outEntry.descriptionNormalized)) continue;

    let best: { entry: TransferCandidate; score: number; amountDiffCents: number } | null = null;

    for (const inEntry of inEntries) {
      if (used.has(inEntry.id)) continue;
      if (outEntry.id === inEntry.id) continue;
      if (!outEntry.accountId || !inEntry.accountId || outEntry.accountId === inEntry.accountId) continue;
      if (isCardPaymentDescription(inEntry.descriptionNormalized)) continue;

      const { score, amountDiffCents } = computeTransferScore(outEntry, inEntry);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = {
          entry: inEntry,
          score,
          amountDiffCents
        };
      }
    }

    if (!best) {
      continue;
    }

    const fromName = outEntry.accountId ? (accountNameMap.get(outEntry.accountId) ?? "Conta origem") : "Origem";
    const toName = best.entry.accountId
      ? (accountNameMap.get(best.entry.accountId) ?? "Conta destino")
      : "Destino";
    const outDescription = normalizeText(buildTransferDescription(fromName, toName));
    const inDescription = normalizeText(buildTransferDescription(fromName, toName));

    if (best.score >= TRANSFER_AUTO_THRESHOLD && best.amountDiffCents === 0) {
      await ledgerRepo.markTransferMatched({
        userId: input.userId,
        outEntryId: outEntry.id,
        inEntryId: best.entry.id,
        transferGroupId: createId(),
        descriptionOut: outDescription,
        descriptionIn: inDescription
      });
      used.add(outEntry.id);
      used.add(best.entry.id);
      matched += 1;
      continue;
    }

    if (best.score >= TRANSFER_SUGGESTION_THRESHOLD || best.amountDiffCents <= FEE_TOLERANCE_CENTS) {
      await ledgerRepo.markEntriesSuggested({
        userId: input.userId,
        entryIds: [outEntry.id, best.entry.id]
      });
      await ledgerRepo.createTransferSuggestion({
        userId: input.userId,
        outEntryId: outEntry.id,
        inEntryId: best.entry.id,
        score: best.score,
        metadata: {
          amountDiff: Number((best.amountDiffCents / 100).toFixed(2)),
          requiresManualFeeReview: best.amountDiffCents > 0
        }
      });
      suggested += 1;
    }
  }

  return {
    matched,
    suggested,
    ignored: Math.max(0, candidates.length - matched * 2 - suggested * 2)
  };
}

export async function confirmTransferForUser(input: {
  userId: string;
  outEntryId: string;
  inEntryId: string;
}): Promise<void> {
  const outEntry = await ledgerRepo.findLedgerEntryById(input.userId, input.outEntryId);
  const inEntry = await ledgerRepo.findLedgerEntryById(input.userId, input.inEntryId);
  if (!outEntry || !inEntry) {
    throw new Error("LEDGER_TRANSFER_ENTRY_NOT_FOUND");
  }
  if (outEntry.direction !== "OUT" || inEntry.direction !== "IN") {
    throw new Error("LEDGER_TRANSFER_DIRECTION_INVALID");
  }
  if (!outEntry.accountId || !inEntry.accountId || outEntry.accountId === inEntry.accountId) {
    throw new Error("LEDGER_TRANSFER_ACCOUNT_INVALID");
  }

  const accountNames = await resolveAccountNames(input.userId, [outEntry.accountId, inEntry.accountId]);
  const fromName = accountNames.get(outEntry.accountId) ?? "Conta origem";
  const toName = accountNames.get(inEntry.accountId) ?? "Conta destino";

  await ledgerRepo.markTransferMatched({
    userId: input.userId,
    outEntryId: outEntry.id,
    inEntryId: inEntry.id,
    transferGroupId: createId(),
    descriptionOut: normalizeText(buildTransferDescription(fromName, toName)),
    descriptionIn: normalizeText(buildTransferDescription(fromName, toName))
  });

  await ledgerRepo.markTransferSuggestionsAsConfirmed({
    userId: input.userId,
    outEntryId: outEntry.id,
    inEntryId: inEntry.id
  });
}

export async function rejectTransferSuggestionForUser(input: {
  userId: string;
  suggestionId?: string;
  outEntryId?: string;
  inEntryId?: string;
}): Promise<void> {
  let outEntryId = input.outEntryId;
  let inEntryId = input.inEntryId;

  if (input.suggestionId) {
    const suggestion = await ledgerRepo.findTransferSuggestionById(input.userId, input.suggestionId);
    if (!suggestion) {
      throw new Error("LEDGER_TRANSFER_SUGGESTION_NOT_FOUND");
    }
    outEntryId = suggestion.outEntryId;
    inEntryId = suggestion.inEntryId;
    await ledgerRepo.updateTransferSuggestionStatus({
      userId: input.userId,
      suggestionId: suggestion.id,
      status: "rejected"
    });
  }

  if (!outEntryId || !inEntryId) {
    throw new Error("LEDGER_TRANSFER_SUGGESTION_INVALID");
  }

  await ledgerRepo.addReconciliationDenial({
    userId: input.userId,
    entryId: outEntryId,
    reason: "transfer_suggestion_rejected"
  });
  await ledgerRepo.addReconciliationDenial({
    userId: input.userId,
    entryId: inEntryId,
    reason: "transfer_suggestion_rejected"
  });

  await ledgerRepo.markEntriesUnmatched({
    userId: input.userId,
    entryIds: [outEntryId, inEntryId]
  });
}

export async function confirmCreditCardPaymentForUser(input: {
  userId: string;
  paymentEntryId: string;
  creditCardAccountId: string;
}): Promise<void> {
  const entry = await ledgerRepo.findLedgerEntryById(input.userId, input.paymentEntryId);
  if (!entry || entry.type !== "cc_payment") {
    throw new Error("LEDGER_CC_PAYMENT_NOT_FOUND");
  }

  const card = await ledgerRepo.findCreditCardAccountById(input.userId, input.creditCardAccountId);
  if (!card) {
    throw new Error("LEDGER_CREDIT_CARD_NOT_FOUND");
  }

  await ledgerRepo.confirmCreditCardPayment({
    userId: input.userId,
    entryId: input.paymentEntryId,
    creditCardAccountId: input.creditCardAccountId
  });
}

export async function getReconciliationInboxForUser(userId: string) {
  return ledgerRepo.getReviewInbox(userId);
}
