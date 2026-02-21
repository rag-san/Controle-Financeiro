import crypto from "crypto";

export function createImportedHash(input: {
  userId: string;
  dateIso: string;
  amount: number;
  normalizedDescription: string;
  accountId: string;
  externalId?: string | null;
}): string {
  const payload = [
    input.userId,
    input.dateIso,
    input.amount.toFixed(2),
    input.normalizedDescription,
    input.accountId,
    input.externalId ?? ""
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}
