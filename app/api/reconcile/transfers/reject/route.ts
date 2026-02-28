import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import { rejectTransferSuggestionForUser } from "@/lib/server/ledger.service";

const payloadSchema = z
  .object({
    suggestionId: z.string().min(6).max(128).optional(),
    outEntryId: z.string().min(6).max(128).optional(),
    inEntryId: z.string().min(6).max(128).optional()
  })
  .superRefine((value, context) => {
    if (!value.suggestionId && (!value.outEntryId || !value.inEntryId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Envie suggestionId ou outEntryId + inEntryId."
      });
    }
  });

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reconcile/transfers/reject.POST", async () => {
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
      await rejectTransferSuggestionForUser({
        userId: auth.userId,
        suggestionId: parsed.data.suggestionId,
        outEntryId: parsed.data.outEntryId,
        inEntryId: parsed.data.inEntryId
      });
      invalidateFinanceCaches(auth.userId);
      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao rejeitar sugestão.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
