import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import { runTransferMatcherForUser } from "@/lib/server/ledger.service";

const payloadSchema = z.object({
  from: z.string().min(10).max(35).optional(),
  to: z.string().min(10).max(35).optional()
});

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reconcile/transfers/run.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const parsed = payloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await runTransferMatcherForUser({
      userId: auth.userId,
      from: parseDate(parsed.data.from),
      to: parseDate(parsed.data.to)
    });
    invalidateFinanceCaches(auth.userId);
    return NextResponse.json({ data: result }, { status: 200 });
  });
}
