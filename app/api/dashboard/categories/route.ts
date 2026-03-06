import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { dashboardMetricsRepo } from "@/lib/server/dashboard-metrics.repo";
import { parseDashboardRangeWithFilters } from "@/app/api/dashboard/_query";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/dashboard/categories.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const rawQuery = Object.fromEntries(request.nextUrl.searchParams.entries());
    const cacheQuery = request.nextUrl.searchParams.toString();
    const cacheKey = `dashboard:${auth.userId}:categories:${cacheQuery || "default"}`;
    const cached = getCache<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached }, { headers: privateCacheHeaders });
    }

    let parsed;
    try {
      parsed = parseDashboardRangeWithFilters(rawQuery);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.flatten() }, { status: 400 });
      }
      return NextResponse.json({ error: "Periodo invalido." }, { status: 400 });
    }

    const payload = await dashboardMetricsRepo.getTopCategories({
      userId: auth.userId,
      range: parsed.range,
      filters: parsed.filters
    });
    setCache(cacheKey, payload, 10_000);

    return NextResponse.json({ data: payload }, { headers: privateCacheHeaders });
  });
}
