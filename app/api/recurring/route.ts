import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { recurringRepo } from "@/lib/server/recurring.repo";

const createRecurringSchema = z.object({
  name: z.string().min(2).max(100),
  amount: z.union([z.number(), z.string()]),
  dueDay: z.number().int().min(1).max(31),
  categoryId: z.string().min(6).max(128).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  lastPaidAt: z.string().optional().nullable()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/recurring.GET", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `recurring:${auth.userId}:list`;
  const cached = getCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const payload = recurringRepo.listByUser(auth.userId, true);

  setCache(cacheKey, payload, 20_000);

  return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/recurring.POST", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
  }
  const parsed = createRecurringSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const recurring = recurringRepo.create({
    userId: auth.userId,
    name: parsed.data.name,
    amount: Number(parsed.data.amount),
    dueDay: parsed.data.dueDay,
    categoryId: parsed.data.categoryId,
    status: parsed.data.status,
    lastPaidAt: parsed.data.lastPaidAt ? new Date(parsed.data.lastPaidAt) : null
  });

  if (!recurring) {
    return NextResponse.json({ error: "Falha ao criar recorrente" }, { status: 500 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(recurring, { status: 201 });
  });
}


