import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders, withDeprecatedApiHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { dashboardRepo } from "@/lib/server/dashboard.repo";

const deprecatedDashboardHeaders = withDeprecatedApiHeaders(privateCacheHeaders, {
  successor: "/api/metrics/official?view=dashboard",
  sunset: "Tue, 30 Jun 2026 23:59:59 GMT",
  message: "Deprecated endpoint. Use /api/metrics/official?view=dashboard."
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/dashboard", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const monthToken = format(new Date(), "yyyy-MM");
    const cacheKey = `dashboard:${auth.userId}:${monthToken}`;
    const cached = getCache(cacheKey);

    if (cached) {
      return NextResponse.json(cached, { headers: deprecatedDashboardHeaders });
    }

    const payload = await dashboardRepo.fullDashboard(auth.userId);
    setCache(cacheKey, payload, 30_000);

    return NextResponse.json(payload, { headers: deprecatedDashboardHeaders });
  });
}


