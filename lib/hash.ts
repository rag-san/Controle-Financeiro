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
  const normalizedDateIso = toNormalizedUtcDateIso(input.date);
  const payload = [
    input.userId,
    input.sourceType,
    normalizedDateIso,
    input.amount.toFixed(2),
    input.normalizedDescription,
    input.accountId,
    input.externalId ?? ""
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}
