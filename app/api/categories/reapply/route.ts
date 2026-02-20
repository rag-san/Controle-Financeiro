import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { resolveRuleCategory, type CategorizationRule } from "@/lib/categorizationRules";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

const payloadSchema = z.object({
  onlyUncategorized: z.boolean().optional().default(false)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const payload = await request.json().catch(() => ({}));
  const parsed = payloadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [rulesDb, transactions] = await Promise.all([
    Promise.resolve(categoryRulesRepo.listActiveByUser(auth.userId)),
    Promise.resolve(transactionsRepo.listForRuleReapply(auth.userId, parsed.data.onlyUncategorized))
  ]);

  const rules: CategorizationRule[] = rulesDb.map((rule) => ({
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
  }));

  const updates = transactions
    .map((transaction) => {
      const categoryId = resolveRuleCategory(rules, {
        description: transaction.description,
        normalizedDescription: transaction.normalizedDescription,
        amount: transaction.amount,
        accountId: transaction.accountId
      });

      if (!categoryId || categoryId === transaction.categoryId) {
        return null;
      }

      return {
        id: transaction.id,
        categoryId
      };
    })
    .filter((item): item is { id: string; categoryId: string } => Boolean(item));

  if (updates.length > 0) {
    transactionsRepo.bulkUpdateCategory(updates);
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({
    totalAnalyzed: transactions.length,
    totalUpdated: updates.length
  });
}


