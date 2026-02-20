import { z } from "zod";
import { resolveRuleCategory, type CategorizationRule } from "@/lib/categorizationRules";
import { createImportedHash } from "@/lib/hash";
import { suggestCategoryWithLocalAi } from "@/lib/local-ai-categorization";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";
import { importsRepo } from "@/lib/server/imports.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export const importCommitPayloadSchema = z.object({
  sourceType: z.enum(["csv", "ofx", "pdf", "manual"]),
  fileName: z.string().min(1),
  defaultAccountId: z.string().min(6).max(128).optional(),
  mapping: z.record(z.unknown()).optional(),
  applyRules: z.boolean().optional().default(true),
  applyLocalAi: z.boolean().optional().default(false),
  rows: z.array(
    z.object({
      date: z.union([z.string(), z.date()]),
      description: z.string(),
      amount: z.number(),
      type: z.enum(["income", "expense"]).optional(),
      accountId: z.string().min(6).max(128).optional(),
      accountHint: z.string().optional(),
      categoryId: z.string().min(6).max(128).nullable().optional(),
      externalId: z.string().optional(),
      raw: z.record(z.unknown()).optional()
    })
  )
});

type ImportCommitPayload = z.infer<typeof importCommitPayloadSchema>;
type ImportRowInput = ImportCommitPayload["rows"][number];

function buildAccountResolver(userId: string, defaultAccountId?: string) {
  const accounts = accountsRepo.listByUser(userId);
  const accountMap = Object.fromEntries(accounts.map((account) => [normalizeDescription(account.name), account.id]));
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));

  const resolveAccountId = (row: ImportRowInput): string | null => {
    if (row.accountId) {
      return row.accountId;
    }

    if (row.accountHint) {
      const normalizedHint = normalizeDescription(row.accountHint);
      if (accountMap[normalizedHint]) {
        return accountMap[normalizedHint];
      }

      const fuzzy = Object.entries(accountMap).find(
        ([name]) => name.includes(normalizedHint) || normalizedHint.includes(name)
      );

      if (fuzzy) {
        return fuzzy[1];
      }
    }

    return defaultAccountId ?? null;
  };

  return {
    resolveAccountId,
    accountNameById
  };
}

function loadRules(userId: string, applyRules: boolean): CategorizationRule[] {
  if (!applyRules) {
    return [];
  }

  return categoryRulesRepo.listActiveByUser(userId).map((rule) => ({
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
}

export async function commitImportForUser(userId: string, payload: ImportCommitPayload) {
  const { resolveAccountId, accountNameById } = buildAccountResolver(userId, payload.defaultAccountId);
  const rules = loadRules(userId, payload.applyRules);
  const categories = categoriesRepo.listByUser(userId);
  const aiCategories = categories.map((item) => ({ id: item.id, name: item.name }));

  let missingAccountCount = 0;
  let aiCategorizedCount = 0;
  let aiUnavailableReason: string | null = null;
  let aiEnabled = payload.applyLocalAi;
  const aiCache = new Map<string, string | null>();
  const importRows: Array<{
    userId: string;
    accountId: string;
    categoryId: string | null;
    date: Date;
    description: string;
    normalizedDescription: string;
    amount: number;
    type: "income" | "expense";
    status: "posted";
    importedHash: string;
    raw: Record<string, unknown>;
  }> = [];

  for (const row of payload.rows) {
    const accountId = resolveAccountId(row);
    if (!accountId) {
      missingAccountCount += 1;
      continue;
    }

    const normalized = normalizeTransaction({
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type
    });

    let categoryId =
      row.categoryId ??
      resolveRuleCategory(rules, {
        description: normalized.description,
        normalizedDescription: normalized.normalizedDescription,
        amount: normalized.amount,
        accountId
      });

    if (!categoryId && aiEnabled && aiCategories.length > 0) {
      const aiCacheKey = `${normalized.normalizedDescription}|${accountId}`;
      if (aiCache.has(aiCacheKey)) {
        const cached = aiCache.get(aiCacheKey) ?? null;
        categoryId = cached;
        if (cached) {
          aiCategorizedCount += 1;
        }
      } else {
        try {
          const aiSuggestedCategoryId = await suggestCategoryWithLocalAi({
            description: normalized.description,
            normalizedDescription: normalized.normalizedDescription,
            amount: normalized.amount,
            accountName: accountNameById.get(accountId),
            categories: aiCategories
          });

          aiCache.set(aiCacheKey, aiSuggestedCategoryId);
          categoryId = aiSuggestedCategoryId;

          if (aiSuggestedCategoryId) {
            aiCategorizedCount += 1;
          }
        } catch (error) {
          const reason =
            error instanceof Error && error.message
              ? error.message
              : "erro desconhecido";
          aiEnabled = false;
          aiUnavailableReason =
            `IA local indisponivel (${reason}). Verifique Ollama ativo/modelo e aumente LOCAL_AI_TIMEOUT_MS se necessario.`;
          aiCache.set(aiCacheKey, null);
        }
      }
    }

    const importedHash = createImportedHash({
      userId,
      dateIso: normalized.date.toISOString(),
      amount: normalized.amount,
      normalizedDescription: normalized.normalizedDescription,
      accountId,
      externalId: row.externalId
    });

    importRows.push({
      userId,
      accountId,
      categoryId,
      date: normalized.date,
      description: normalized.description,
      normalizedDescription: normalized.normalizedDescription,
      amount: normalized.amount,
      type: normalized.type,
      status: "posted",
      importedHash,
      raw: row.raw ?? {}
    });
  }

  const batch = importsRepo.createBatch({
    userId,
    sourceType: payload.sourceType,
    fileName: payload.fileName,
    mapping: payload.mapping
  });

  if (!batch) {
    throw new Error("Falha ao criar lote de importacao");
  }

  const importedHashes = importRows.map((row) => row.importedHash);
  const existingHashes = new Set(transactionsRepo.findImportedHashes(userId, importedHashes));
  const seenInBatch = new Set<string>();

  const rowsToCreate = importRows.filter((row) => {
    if (existingHashes.has(row.importedHash)) {
      return false;
    }
    if (seenInBatch.has(row.importedHash)) {
      return false;
    }
    seenInBatch.add(row.importedHash);
    return true;
  });

  const createMany =
    rowsToCreate.length > 0
      ? transactionsRepo.createMany(
          rowsToCreate.map((row) => ({
            ...row,
            importBatchId: batch.id
          }))
        )
      : { count: 0 };

  const totalImported = createMany.count;
  const duplicateOrSkipped = importRows.length - totalImported;
  const totalSkipped = duplicateOrSkipped + missingAccountCount;

  const importedDates = rowsToCreate.map((row) => row.date.getTime()).filter((value) => Number.isFinite(value));
  const minTimestamp = importedDates.length > 0 ? Math.min(...importedDates) : null;
  const maxTimestamp = importedDates.length > 0 ? Math.max(...importedDates) : null;

  importsRepo.updateBatchTotals({
    id: batch.id,
    totalImported,
    totalSkipped
  });

  return {
    batchId: batch.id,
    totalImported,
    totalSkipped,
    totalReceived: payload.rows.length,
    aiCategorizedCount,
    aiUnavailableReason: payload.applyLocalAi ? aiUnavailableReason : null,
    importedRange:
      minTimestamp !== null && maxTimestamp !== null
        ? {
            from: new Date(minTimestamp).toISOString(),
            to: new Date(maxTimestamp).toISOString()
          }
        : null
  };
}
