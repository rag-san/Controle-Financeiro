import { type CategorizationRule } from "@/lib/categorizationRules";
import {
  categorizeImportRowDeterministic,
  type CategorizationHistorySample
} from "@/lib/import-categorization-deterministic";
import type { CanonicalImportRow } from "@/lib/import-canonical";
import { buildMerchantKey } from "@/lib/import-text";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export type ImportAutocategorizationContext = {
  categories: Array<{ id: string; name: string }>;
  rules: CategorizationRule[];
  history: CategorizationHistorySample[];
};

export async function loadImportAutocategorizationContext(
  userId: string,
  options?: { applyRules?: boolean }
): Promise<ImportAutocategorizationContext> {
  const applyRules = options?.applyRules ?? true;
  const [categories, rules, historyRows] = await Promise.all([
    categoriesRepo.listByUser(userId),
    applyRules ? categoryRulesRepo.listActiveByUser(userId) : Promise.resolve([]),
    transactionsRepo.listAutocategorizationHistory(userId)
  ]);

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name
    })),
    rules: rules.map((rule) => ({
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
    })),
    history: historyRows.map((row) => ({
      merchantKey: row.merchantKey || buildMerchantKey(row.description),
      description: row.description,
      categoryId: row.categoryId,
      categorySource: row.categorySource
    }))
  };
}

export function categorizeCanonicalImportRowWithContext(input: {
  row: CanonicalImportRow;
  accountId?: string | null;
  context: ImportAutocategorizationContext;
}) {
  return categorizeImportRowDeterministic({
    row: input.row,
    accountId: input.accountId,
    userRules: input.context.rules,
    categories: input.context.categories,
    history: input.context.history
  });
}
