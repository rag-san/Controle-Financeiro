import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { extractMerchantKey, normalizeText } from "@/src/features/categorization/normalizeMerchant";
import { pickBestRuleMatch, type CategoryRule } from "@/src/features/categorization/rules";
import {
  buildMerchantSimilarityIndex,
  findMostSimilarMerchant,
  type MerchantSimilarityIndex
} from "@/src/features/categorization/similarity";

export type Suggestion = {
  categoryId: string;
  confidence: number;
  reason: string;
  merchantKey: string;
};

type SuggestionContext = {
  mappings: Record<string, string>;
  categoryById: Map<string, CategoryDTO>;
  rules: CategoryRule[];
  similarityIndex: MerchantSimilarityIndex;
};

const UNCATEGORIZED_NAMES = ["sem categoria", "uncategorized", "nao categorizado", "não categorizado"];

function isUncategorizedName(name: string | null | undefined): boolean {
  if (!name) return true;
  const normalized = normalizeText(name);
  return UNCATEGORIZED_NAMES.some((entry) => normalized.includes(entry));
}

export function isTransactionUncategorized(transaction: TransactionDTO): boolean {
  if (!transaction.categoryId) return true;
  return isUncategorizedName(transaction.category?.name);
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

function toSimilarityConfidence(score: number): number {
  const boundedScore = Math.max(0.55, Math.min(1, score));
  const confidence = 0.55 + (boundedScore - 0.55) * (0.25 / 0.45);
  return Math.min(0.8, normalizeConfidence(confidence));
}

export function buildSuggestionContext(params: {
  categories: CategoryDTO[];
  transactions: TransactionDTO[];
  mappings: Record<string, string>;
  rules: CategoryRule[];
}): SuggestionContext {
  const categoryById = new Map(params.categories.map((category) => [category.id, category]));
  const knownMerchants: Array<{ merchantKey: string; categoryId: string; weight: number }> = [];

  for (const [merchantKey, categoryId] of Object.entries(params.mappings)) {
    if (!merchantKey || !categoryById.has(categoryId)) continue;
    knownMerchants.push({ merchantKey, categoryId, weight: 4 });
  }

  for (const transaction of params.transactions) {
    if (!transaction.categoryId || !categoryById.has(transaction.categoryId)) continue;
    if (isTransactionUncategorized(transaction)) continue;

    const merchantKey = extractMerchantKey(transaction);
    if (!merchantKey || merchantKey === "transacao") continue;
    knownMerchants.push({ merchantKey, categoryId: transaction.categoryId, weight: 1 });
  }

  return {
    mappings: params.mappings,
    categoryById,
    rules: params.rules,
    similarityIndex: buildMerchantSimilarityIndex(knownMerchants)
  };
}

export function suggestCategory(transaction: TransactionDTO, context: SuggestionContext): Suggestion | null {
  const merchantKey = extractMerchantKey(transaction);
  if (!merchantKey || merchantKey === "transacao") {
    return null;
  }

  const mappedCategoryId = context.mappings[merchantKey];
  if (mappedCategoryId && context.categoryById.has(mappedCategoryId)) {
    return {
      categoryId: mappedCategoryId,
      confidence: 0.9,
      reason: "Mapeamento aprendido",
      merchantKey
    };
  }

  const rule = pickBestRuleMatch(transaction, merchantKey, context.rules);
  if (rule && context.categoryById.has(rule.categoryId)) {
    return {
      categoryId: rule.categoryId,
      confidence: normalizeConfidence(rule.confidence),
      reason: rule.reason,
      merchantKey
    };
  }

  const similar = findMostSimilarMerchant(merchantKey, context.similarityIndex, {
    minScore: 0.55,
    maxCandidates: 140
  });

  if (similar && context.categoryById.has(similar.categoryId)) {
    return {
      categoryId: similar.categoryId,
      confidence: toSimilarityConfidence(similar.score),
      reason: `Similar a "${similar.merchantKey}"`,
      merchantKey
    };
  }

  return null;
}
