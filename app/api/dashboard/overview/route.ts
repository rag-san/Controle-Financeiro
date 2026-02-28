import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseDashboardRangeWithFilters } from "@/app/api/dashboard/_query";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { dashboardMetricsRepo } from "@/lib/server/dashboard-metrics.repo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/dashboard/overview.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const rawQuery = Object.fromEntries(request.nextUrl.searchParams.entries());
    const cacheQuery = request.nextUrl.searchParams.toString();
    const cacheKey = `dashboard:${auth.userId}:overview:${cacheQuery || "default"}`;
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

    const [summary, categories, trends, patrimony] = await Promise.all([
      dashboardMetricsRepo.getSummary({
        userId: auth.userId,
        range: parsed.range,
        filters: parsed.filters
      }),
      dashboardMetricsRepo.getTopCategories({
        userId: auth.userId,
        range: parsed.range,
        filters: parsed.filters
      }),
      dashboardMetricsRepo.getTrends({
        userId: auth.userId,
        range: parsed.range,
        granularity: "day",
        filters: parsed.filters
      }),
      dashboardMetricsRepo.getPatrimony({
        userId: auth.userId,
        range: parsed.range,
        granularity: "day",
        filters: parsed.filters
      })
    ]);

    const payload = {
      from: parsed.range.from,
      to: parsed.range.to,
      summary,
      categories: categories.topCategories,
      trends,
      patrimony
    };

    setCache(cacheKey, payload, 10_000);

    return NextResponse.json({ data: payload }, { headers: privateCacheHeaders });
  });
}
