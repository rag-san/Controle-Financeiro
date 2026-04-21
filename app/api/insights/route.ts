import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { LedgerCoverageError } from "@/lib/server/analytics-source";
import {
  type NormalizedTransaction,
  type FinancialAccountType
} from "@/lib/finance/normalized-transactions";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { buildInsights } from "@/src/features/insights/buildInsights";
import { buildPeriodComparison } from "@/src/features/insights/utils/period";

function resolveAccountType(type: FinancialAccountType | null | undefined): TransactionDTO["account"]["type"] {
  if (type === "checking" || type === "credit" || type === "cash" || type === "investment") {
    return type;
  }
  return "checking";
}

function resolveTransactionType(entry: NormalizedTransaction): TransactionDTO["type"] {
  if (entry.budgetImpact === "counts_as_income") {
    return "income";
  }
  if (entry.budgetImpact === "counts_as_expense") {
    return "expense";
  }
  return "transfer";
}

function toTransactionAmount(entry: NormalizedTransaction, type: TransactionDTO["type"]): number {
  if (type === "income") {
    return Math.abs(entry.budgetSignedAmount || entry.signedAmount);
  }

  if (type === "expense") {
    return -Math.abs(entry.budgetSignedAmount || entry.signedAmount);
  }

  return entry.signedAmount;
}

function toTransactionDirection(amount: number): "in" | "out" {
  return amount >= 0 ? "in" : "out";
}

function toInsightTransaction(
  entry: NormalizedTransaction,
  categoriesById: Map<string, CategoryDTO>
): TransactionDTO | null {
  const accountId = entry.accountId?.trim();
  if (!accountId) {
    return null;
  }

  const type = resolveTransactionType(entry);
  const amount = toTransactionAmount(entry, type);
  const accountType = resolveAccountType(entry.accountType);
  const category = entry.categoryId ? categoriesById.get(entry.categoryId) ?? null : null;

  return {
    id: entry.id,
    accountId,
    categoryId: entry.categoryId ?? null,
    importBatchId: entry.importBatchId ?? null,
    date: entry.date,
    description: entry.descriptionOriginal,
    amount,
    type,
    direction: toTransactionDirection(amount),
    excluded: entry.excluded,
    isInternalTransfer: entry.isInternalTransfer,
    status: "posted",
    transferGroupId: null,
    transferPeerTxId: null,
    transferFromAccountId: null,
    transferToAccountId: null,
    raw: null,
    account: {
      id: accountId,
      name: entry.accountName?.trim() || "Conta",
      type: accountType,
      institution: null,
      currency: "BRL",
      parentAccountId: null
    },
    category: category
      ? {
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon ?? null,
          parentId: category.parentId ?? null
        }
      : null
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/insights.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const period = buildPeriodComparison({
      referenceDate: new Date(),
      range: "this-month"
    });

    let categories;
    let normalizedScope;
    try {
      [categories, normalizedScope] = await Promise.all([
        categoriesRepo.listByUser(auth.userId),
        loadNormalizedTransactionsForScope({
          userId: auth.userId,
          from: period.previousPeriod.start,
          to: period.currentPeriod.end,
          excluded: false,
          hideCardPaymentMirrorInflow: true
        })
      ]);
    } catch (error) {
      if (error instanceof LedgerCoverageError) {
        return NextResponse.json(
          {
            code: "ledger_coverage_incomplete",
            message:
              "A cobertura do ledger está incompleta para gerar insights. Corrija a sincronização antes de continuar.",
            details: {
              reason: error.resolution.reason,
              legacyTransactionCount: error.resolution.legacyTransactionCount,
              unmirroredLegacyTransactionCount: error.resolution.unmirroredLegacyTransactionCount,
              ledgerEntryCount: error.resolution.ledgerEntryCount
            }
          },
          { status: 409 }
        );
      }
      throw error;
    }
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const transactions = normalizedScope.entries
      .map((entry) => toInsightTransaction(entry, categoriesById))
      .filter((entry): entry is TransactionDTO => entry !== null);

    const insights = buildInsights({
      transactions,
      categories,
      period,
      today: new Date()
    }).slice(0, 6);

    return NextResponse.json(
      {
        insights
      },
      {
        headers: privateCacheHeaders
      }
    );
  });
}
