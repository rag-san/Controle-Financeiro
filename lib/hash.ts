import crypto from "crypto";

type ImportSourceType = "csv" | "ofx" | "pdf" | "manual";

export function toNormalizedUtcDateIso(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Data invalida para assinatura de importacao");
  }

  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}

export function createImportedHash(input: {
  userId: string;
  sourceType: ImportSourceType;
  date: Date;
  amount: number;
  normalizedDescription: string;
  accountId: string;
  externalId?: string | null;
}): string {
  const normalizedExternalId = input.externalId?.trim().toUpperCase() ?? "";

  if (normalizedExternalId) {
    const payload = ["ext-v1", input.userId, input.accountId, normalizedExternalId].join("|");
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  const normalizedDateIso = toNormalizedUtcDateIso(input.date);
  const absoluteAmount = Math.abs(input.amount);
  const payload = [
    input.userId,
    normalizedDateIso,
    absoluteAmount.toFixed(2),
    input.normalizedDescription,
    input.accountId
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function createTransferKeyHash(input: {
  userId: string;
  date: Date;
  amount: number;
  normalizedDescription: string;
  fromAccountId: string;
  toAccountId: string;
  externalId?: string | null;
}): string {
  const normalizedDateIso = toNormalizedUtcDateIso(input.date);
  const payload = [
    input.userId,
    normalizedDateIso,
    Math.abs(input.amount).toFixed(2),
    input.normalizedDescription,
    input.fromAccountId,
    input.toAccountId,
    input.externalId ?? ""
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}
