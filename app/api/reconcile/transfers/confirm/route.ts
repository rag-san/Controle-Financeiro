import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import { confirmTransferForUser } from "@/lib/server/ledger.service";

const payloadSchema = z.object({
  outEntryId: z.string().min(6).max(128),
  inEntryId: z.string().min(6).max(128)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reconcile/transfers/confirm.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
    }

    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      await confirmTransferForUser({
        userId: auth.userId,
        outEntryId: parsed.data.outEntryId,
        inEntryId: parsed.data.inEntryId
      });
      invalidateFinanceCaches(auth.userId);
      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao confirmar transferência.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
