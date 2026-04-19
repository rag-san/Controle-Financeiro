import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { getFinancialBreakdownSnapshot } from "@/lib/server/financial-breakdown.service";

const createAccountSchema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(["checking", "credit", "cash", "investment"]),
  institution: z.string().max(120).optional().nullable(),
  currency: z.string().length(3).default("BRL"),
  parentAccountId: z.string().min(6).max(128).optional().nullable()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/accounts.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const cacheKey = `accounts:${auth.userId}:list`;
    const cached = getCache<
      Array<{
        id: string;
        userId: string;
        name: string;
        type: "checking" | "credit" | "cash" | "investment";
        institution: string | null;
        currency: string;
        parentAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        currentBalance: number;
        confirmedBalance?: {
          amount: number;
          date: string;
          sourceType: "csv" | "ofx" | "pdf" | "manual";
          fileName: string;
          importBatchId: string | null;
          openingBalance: number | null;
          computedClosingBalance: number | null;
          rowCount: number;
          balanceAnchorCount: number;
          importedAt: string;
          difference: number;
        } | null;
        cardMetrics?: {
          spending: number;
          payments: number;
          openDebt: number;
          futureInstallments: number;
          totalCommitted: number;
        };
      }>
    >(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: privateCacheHeaders });
    }

    const payload = await accountsRepo.listByUserWithBalance(auth.userId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const financeBreakdown = (
      await getFinancialBreakdownSnapshot({
        userId: auth.userId,
        currentFrom: monthStart,
        currentTo: now
      })
    ).breakdown;
    const cardMetricsById = new Map(
      financeBreakdown.cards.map((card) => [
        card.creditCardAccountId,
        {
          spending: card.spending,
          payments: card.payments,
          openDebt: card.openDebt,
          futureInstallments: card.futureInstallments,
          totalCommitted: card.totalCommitted
        }
      ])
    );
    const enrichedPayload = payload.map((account) =>
      account.type === "credit"
        ? {
            ...account,
            cardMetrics: cardMetricsById.get(account.id)
          }
        : account
    );

    setCache(cacheKey, enrichedPayload, 20_000);

    return NextResponse.json(enrichedPayload, { headers: privateCacheHeaders });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/accounts.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload JSON inválido" }, { status: 400 });
    }

    const parsed = createAccountSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    let account;
    try {
      account = await accountsRepo.create({
        userId: auth.userId,
        ...parsed.data,
        name: parsed.data.name.trim(),
        institution: parsed.data.institution?.trim() || null,
        currency: parsed.data.currency.toUpperCase(),
        parentAccountId: parsed.data.parentAccountId ?? null
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("FOREIGN KEY")) {
        return NextResponse.json({ error: "Sessao invalida. Faca login novamente." }, { status: 401 });
      }
      if (
        error instanceof Error &&
        ["PARENT_ACCOUNT_NOT_FOUND", "PARENT_ACCOUNT_INVALID_TYPE", "PARENT_ACCOUNT_SELF_REFERENCE"].includes(
          error.message
        )
      ) {
        return NextResponse.json({ error: "Conta mae invalida para este cadastro." }, { status: 400 });
      }
      throw error;
    }
    if (!account) {
      return NextResponse.json({ error: "Falha ao criar conta" }, { status: 500 });
    }

    invalidateFinanceCaches(auth.userId);

    return NextResponse.json(account, { status: 201 });
  });
}



