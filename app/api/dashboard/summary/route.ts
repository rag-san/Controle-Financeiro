import { endOfMonth, startOfMonth } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { withRouteProfiling } from "@/lib/profiling";
import { dashboardRepo } from "@/lib/server/dashboard.repo";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/dashboard/summary.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const now = new Date();
    const from = parsed.data.from ? new Date(parsed.data.from) : startOfMonth(now);
    const to = parsed.data.to ? new Date(parsed.data.to) : endOfMonth(now);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Período inválido" }, { status: 400 });
    }

    const payload = await dashboardRepo.summaryByRange(auth.userId, from, to);
    return NextResponse.json(payload);
  });
}



