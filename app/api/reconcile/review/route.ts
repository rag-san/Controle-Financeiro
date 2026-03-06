import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { withRouteProfiling } from "@/lib/profiling";
import { getReconciliationInboxForUser } from "@/lib/server/ledger.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reconcile/review.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const inbox = await getReconciliationInboxForUser(auth.userId);
    return NextResponse.json({ data: inbox });
  });
}
