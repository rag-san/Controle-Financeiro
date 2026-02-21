import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { categoriesRepo } from "@/lib/server/categories.repo";

const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  color: z.string().min(4).max(32).default("#3b82f6"),
  icon: z.string().max(50).optional().nullable(),
  parentId: z.string().min(6).max(128).optional().nullable()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/categories.GET", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `categories:${auth.userId}:list`;
  const cached = getCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const categories = categoriesRepo.listByUser(auth.userId, true);

  setCache(cacheKey, categories, 20_000);

  return NextResponse.json(categories, { headers: privateCacheHeaders });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/categories.POST", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
  }
  const parsed = createCategorySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = categoriesRepo.create({
    userId: auth.userId,
    ...parsed.data
  });

  if (!category) {
    return NextResponse.json({ error: "Falha ao criar categoria" }, { status: 500 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(category, { status: 201 });
  });
}


