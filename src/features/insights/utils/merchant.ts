import type { TransactionDTO } from "@/lib/types";
import {
  extractMerchantKey as extractMerchantKeyFromCategorization,
  normalizeText as normalizeMerchantText
} from "@/src/features/categorization/normalizeMerchant";

export function normalizeMerchant(value: string): string {
  return normalizeMerchantText(value);
}

export function extractMerchantKey(transaction: TransactionDTO): string {
  return extractMerchantKeyFromCategorization(transaction);
}
