import type { TransactionDTO } from "@/lib/types";
import { buildMerchantKey, normalizeImportText } from "@/lib/import-text";

export function normalizeText(value: string): string {
  return normalizeImportText(value ?? "", {
    uppercase: false,
    stripAccents: true,
    removeNoise: true
  }).toLowerCase();
}

export function extractMerchantKey(transaction: TransactionDTO): string {
  const rawMerchantKey =
    typeof transaction.raw?.merchantKey === "string" ? transaction.raw.merchantKey : null;

  return buildMerchantKey(rawMerchantKey || transaction.description || "");
}
