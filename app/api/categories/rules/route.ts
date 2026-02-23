import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";

const createRuleSchema = z.object({
  name: z.string().min(2).max(80),
  priority: z.number().int().min(1).max(10000).default(100),
  enabled: z.boolean().default(true),
  matchType: z.enum(["contains", "regex"]),
  pattern: z.string().min(1).max(160),
  accountId: z.string().min(6).max(128).optional().nullable(),
  minAmount: z.number().nonnegative().optional().nullable(),
  maxAmount: z.number().nonnegative().optional().nullable(),
  categoryId: z.string().min(6).max(128)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `category-rules:${auth.userId}:list`;
  const cached = getCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const payload = await categoryRulesRepo.listByUser(auth.userId, true);

  setCache(cacheKey, payload, 20_000);

  return NextResponse.json(payload, { headers: privateCacheHeaders });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
  }
  const parsed = createRuleSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await categoryRulesRepo.create({
    userId: auth.userId,
    name: parsed.data.name,
    priority: parsed.data.priority,
    enabled: parsed.data.enabled,
    matchType: parsed.data.matchType,
    pattern: parsed.data.pattern,
    accountId: parsed.data.accountId,
    minAmount: parsed.data.minAmount,
    maxAmount: parsed.data.maxAmount,
    categoryId: parsed.data.categoryId
  });

  if (!rule) {
    return NextResponse.json({ error: "Falha ao criar regra" }, { status: 500 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(rule, { status: 201 });
}


