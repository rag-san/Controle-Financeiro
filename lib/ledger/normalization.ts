import crypto from "node:crypto";

export type LedgerEntryType =
  | "income"
  | "expense"
  | "transfer"
  | "cc_purchase"
  | "cc_payment"
  | "fee"
  | "refund";

export type LedgerDirection = "IN" | "OUT";

function normalizeDateDay(input: Date): string {
  if (!Number.isFinite(input.getTime())) {
    throw new Error("LEDGER_INVALID_DATE");
  }

  const year = input.getUTCFullYear();
  const month = String(input.getUTCMonth() + 1).padStart(2, "0");
  const day = String(input.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeText(value: string): string {
  return String(value ?? "")
    .replace(/\uFFFD/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeAmountCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("LEDGER_INVALID_AMOUNT");
  }

  const cents = Math.round(Math.abs(value) * 100);
  if (cents <= 0) {
    throw new Error("LEDGER_AMOUNT_MUST_BE_POSITIVE");
  }
  return cents;
}

export function buildFingerprint(input: {
  postedAt: Date;
  amountCents: number;
  type: LedgerEntryType;
  direction?: LedgerDirection | null;
  descriptionNormalized: string;
  merchantNormalized?: string | null;
  accountId?: string | null;
  creditCardAccountId?: string | null;
  institutionId?: string | null;
}): string {
  const accountRef = input.accountId?.trim() || input.creditCardAccountId?.trim() || "";
  const descriptionRef = normalizeText(input.descriptionNormalized);
  const merchantRef = normalizeOptionalText(input.merchantNormalized) ?? "";
  const directionRef = input.direction ?? "";
  const institutionRef = input.institutionId?.trim() ?? "";

  const payload = [
    normalizeDateDay(input.postedAt),
    String(Math.round(Math.abs(input.amountCents))),
    input.type,
    directionRef,
    descriptionRef,
    merchantRef,
    accountRef,
    institutionRef
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildImportFileHash(input: {
  filename: string;
  kind: "BANK_STATEMENT" | "CC_STATEMENT";
  canonicalRows: string;
}): string {
  const payload = [input.filename.trim().toLowerCase(), input.kind, input.canonicalRows].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}
