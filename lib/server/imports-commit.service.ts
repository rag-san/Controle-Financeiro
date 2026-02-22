import { z } from "zod";
import { type CategorizationRule } from "@/lib/categorizationRules";
import { createImportedHash } from "@/lib/hash";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { categorizeImportRowDeterministic } from "@/lib/import-categorization-deterministic";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";
import { importsRepo } from "@/lib/server/imports.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export const MAX_IMPORT_COMMIT_ROWS = 5000;

export const importCommitPayloadSchema = z.object({
  sourceType: z.enum(["csv", "ofx", "pdf", "manual"]),
  fileName: z.string().min(1).max(255),
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
      balanceAfter: z.number().optional().nullable(),
      transactionKindRaw: z.string().optional(),
      counterpartyRaw: z.string().optional(),
      transactionKindNorm: z.string().optional(),
      counterpartyNorm: z.string().optional(),
      merchantKey: z.string().optional(),
      sourceType: z.enum(["csv", "ofx", "pdf", "manual"]).optional(),
      documentType: z.string().optional().nullable(),
      accountId: z.string().min(6).max(128).optional(),
      accountHint: z.string().optional(),
      categoryId: z.string().min(6).max(128).nullable().optional(),
      externalId: z.string().optional(),
      raw: z.record(z.unknown()).optional()
    })
  ).max(MAX_IMPORT_COMMIT_ROWS)
});

type ImportCommitPayload = z.infer<typeof importCommitPayloadSchema>;
type ImportRowInput = ImportCommitPayload["rows"][number];

function buildAccountResolver(userId: string, defaultAccountId?: string) {
  const accounts = accountsRepo.listByUser(userId);
  const accountMap = Object.fromEntries(accounts.map((account) => [normalizeDescription(account.name), account.id]));

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
    resolveAccountId
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
  const { resolveAccountId } = buildAccountResolver(userId, payload.defaultAccountId);
  const rules = loadRules(userId, payload.applyRules);
  const categories = categoriesRepo.listByUser(userId);
  const categoryRefs = categories.map((item) => ({ id: item.id, name: item.name }));
  const shouldApplyDeterministic = payload.applyRules;

  let missingAccountCount = 0;
  let invalidRowCount = 0;
  let invalidDateCount = 0;
  let deterministicCategorizedCount = 0;
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

    let normalized: ReturnType<typeof normalizeTransaction>;
    try {
      normalized = normalizeTransaction({
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type
      });
    } catch (error) {
      invalidRowCount += 1;
      if (error instanceof Error && error.message.toLowerCase().includes("data invalida")) {
        invalidDateCount += 1;
      }
      continue;
    }

    if (!normalized.description || !Number.isFinite(normalized.amount)) {
      invalidRowCount += 1;
      continue;
    }

    const canonical = toCanonicalImportRow({
      date: normalized.date,
      amount: normalized.amount,
      type: normalized.type,
      sourceType: payload.sourceType,
      documentType: row.documentType ?? null,
      balanceAfter: row.balanceAfter ?? null,
      description: normalized.description,
      transactionKindRaw: row.transactionKindRaw,
      counterpartyRaw: row.counterpartyRaw,
      externalId: row.externalId,
      accountHint: row.accountHint,
      accountId,
      categoryId: row.categoryId ?? null,
      raw: row.raw ?? {}
    });

    const deterministic = shouldApplyDeterministic
      ? categorizeImportRowDeterministic({
          row: canonical,
          accountId,
          userRules: rules,
          categories: categoryRefs
        })
      : {
          categoryId: null,
          categorySource: "none" as const,
          matchedRule: null
        };

    const categoryId = row.categoryId ?? deterministic.categoryId;
    if (!row.categoryId && deterministic.categoryId) {
      deterministicCategorizedCount += 1;
    }

    const importedHash = createImportedHash({
      userId,
      sourceType: payload.sourceType,
      date: canonical.date,
      amount: canonical.amount,
      normalizedDescription: canonical.normalizedDescription,
      accountId,
      externalId: row.externalId
    });

    importRows.push({
      userId,
      accountId,
      categoryId,
      date: canonical.date,
      description: canonical.description,
      normalizedDescription: canonical.normalizedDescription,
      amount: canonical.amount,
      type: canonical.type,
      status: "posted",
      importedHash,
      raw: {
        ...(row.raw ?? {}),
        balanceAfter: canonical.balanceAfter ?? null,
        transactionKindRaw: canonical.transactionKindRaw,
        counterpartyRaw: canonical.counterpartyRaw,
        transactionKindNorm: canonical.transactionKindNorm,
        counterpartyNorm: canonical.counterpartyNorm,
        merchantKey: canonical.merchantKey,
        sourceType: canonical.sourceType,
        documentType: canonical.documentType ?? null,
        categorySource: row.categoryId ? "manual" : deterministic.categorySource,
        matchedRule: row.categoryId ? null : deterministic.matchedRule
      }
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
  let duplicateInDatabaseCount = 0;
  let duplicateInPayloadCount = 0;

  const rowsToCreate = importRows.filter((row) => {
    if (existingHashes.has(row.importedHash)) {
      duplicateInDatabaseCount += 1;
      return false;
    }
    if (seenInBatch.has(row.importedHash)) {
      duplicateInPayloadCount += 1;
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
  const duplicates = duplicateInDatabaseCount + duplicateInPayloadCount;
  const invalidRows = missingAccountCount + invalidRowCount;
  const totalSkipped = duplicates + invalidRows;

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
    duplicates,
    invalidRows,
    duplicateDetails: {
      inDatabase: duplicateInDatabaseCount,
      inPayload: duplicateInPayloadCount
    },
    invalidDetails: {
      missingAccount: missingAccountCount,
      invalidRows: invalidRowCount,
      invalidDate: invalidDateCount
    },
    summary: {
      imported: totalImported,
      skipped: totalSkipped,
      duplicates,
      invalid: invalidRows
    },
    totalReceived: payload.rows.length,
    deterministicCategorizedCount,
    aiCategorizedCount: 0,
    aiUnavailableReason: payload.applyLocalAi
      ? "Categorizacao por IA local foi desativada para este fluxo. Use regras deterministicas."
      : null,
    importedRange:
      minTimestamp !== null && maxTimestamp !== null
        ? {
            from: new Date(minTimestamp).toISOString(),
            to: new Date(maxTimestamp).toISOString()
          }
        : null
  };
}
