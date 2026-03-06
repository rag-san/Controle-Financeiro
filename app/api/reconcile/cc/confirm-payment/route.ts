import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import { confirmCreditCardPaymentForUser } from "@/lib/server/ledger.service";

const payloadSchema = z.object({
  paymentEntryId: z.string().min(6).max(128),
  creditCardAccountId: z.string().min(6).max(128)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reconcile/cc/confirm-payment.POST", async () => {
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
      await confirmCreditCardPaymentForUser({
        userId: auth.userId,
        paymentEntryId: parsed.data.paymentEntryId,
        creditCardAccountId: parsed.data.creditCardAccountId
      });
      invalidateFinanceCaches(auth.userId);
      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao conciliar pagamento da fatura.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
