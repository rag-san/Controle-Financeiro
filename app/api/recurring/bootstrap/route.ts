import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { recurringRepo } from "@/lib/server/recurring.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/recurring/bootstrap.GET", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `bootstrap:${auth.userId}:recurring`;
  const cached = getCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const [items, categories] = await Promise.all([
    recurringRepo.listByUser(auth.userId, true),
    categoriesRepo.listByUser(auth.userId)
  ]);

  const payload = {
    items,
    categories
  };

  setCache(cacheKey, payload, 20_000);

  return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}

