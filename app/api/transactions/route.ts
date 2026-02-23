import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import {
  createTransactionForUser,
  createTransactionSchema,
  listTransactionsForUser,
  transactionsQuerySchema
} from "@/lib/server/transactions.service";
import { transactionsRepo } from "@/lib/server/transactions.repo";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(6).max(128)).min(1).max(500)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/transactions.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const cacheQuery = request.nextUrl.searchParams.toString();
    const cacheKey = `transactions:${auth.userId}:${cacheQuery || "default"}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: privateCacheHeaders });
    }

    const parsed = transactionsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const payload = await listTransactionsForUser(auth.userId, parsed.data);

    setCache(cacheKey, payload, 10_000);

    return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/transactions.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
    }
    const parsed = createTransactionSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const transaction = await createTransactionForUser(auth.userId, parsed.data);

    if (!transaction) {
      return NextResponse.json({ error: "Falha ao criar transacao" }, { status: 500 });
    }

    invalidateFinanceCaches(auth.userId);

    return NextResponse.json(transaction, { status: 201 });
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/transactions.DELETE", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
    }

    const parsed = bulkDeleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const dedupedIds = [...new Set(parsed.data.ids)];
    const deletedCount = await transactionsRepo.deleteManyByIdsForUser(dedupedIds, auth.userId);

    invalidateFinanceCaches(auth.userId);

    return NextResponse.json({
      success: true,
      requestedCount: dedupedIds.length,
      deletedCount
    });
  });
}


