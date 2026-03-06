import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import { importLedgerForUser } from "@/lib/server/ledger.service";

const importRowSchema = z.object({
  postedAt: z.union([z.string(), z.date()]),
  amount: z.number(),
  direction: z.enum(["IN", "OUT", "in", "out"]).optional(),
  description: z.string().min(1).max(255),
  externalId: z.string().max(255).optional(),
  merchant: z.string().max(255).optional(),
  accountId: z.string().min(6).max(128).optional(),
  creditCardAccountId: z.string().min(6).max(128).optional(),
  categoryId: z.string().min(6).max(128).nullable().optional(),
  type: z.enum(["income", "expense", "transfer", "cc_purchase", "cc_payment", "fee", "refund"]).optional(),
  meta: z.record(z.unknown()).optional()
});

const importPayloadSchema = z.object({
  institutionId: z.string().min(6).max(128).optional(),
  institutionName: z.string().min(2).max(120).optional(),
  kind: z.enum(["BANK_STATEMENT", "CC_STATEMENT"]),
  filename: z.string().min(1).max(255),
  fileHash: z.string().min(12).max(128).optional(),
  defaultAccountId: z.string().min(6).max(128).optional(),
  defaultCreditCardAccountId: z.string().min(6).max(128).optional(),
  rows: z.array(importRowSchema).min(1).max(10000)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/import.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
    }

    const parsed = importPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      const result = await importLedgerForUser(auth.userId, parsed.data);
      invalidateFinanceCaches(auth.userId);
      return NextResponse.json(
        {
          ...result,
          idempotent: true
        },
        { status: result.duplicateImportSource ? 200 : 201 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao importar.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
