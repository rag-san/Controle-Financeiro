import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { withRouteProfiling } from "@/lib/profiling";
import { importObservabilityRepo } from "@/lib/server/import-observability.repo";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/metrics/import-observability.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const from = parseDate(parsed.data.from);
    const to = parseDate(parsed.data.to);
    if (parsed.data.from && !from) {
      return NextResponse.json({ error: "Parametro from invalido." }, { status: 400 });
    }
    if (parsed.data.to && !to) {
      return NextResponse.json({ error: "Parametro to invalido." }, { status: 400 });
    }
    if (from && to && from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "Parametro from deve ser menor ou igual a to." }, { status: 400 });
    }

    const bySourcePhase = importObservabilityRepo.summarizeBySource({
      userId: auth.userId,
      from: from ?? undefined,
      to: to ?? undefined
    });
    const recentErrors = importObservabilityRepo.recentErrors({
      userId: auth.userId,
      from: from ?? undefined,
      to: to ?? undefined,
      limit: parsed.data.limit
    });

    return NextResponse.json({
      view: "import-observability",
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null
      },
      bySourcePhase,
      recentErrors
    });
  });
}
