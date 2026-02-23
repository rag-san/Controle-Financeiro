import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";

const updateRuleSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  priority: z.number().int().min(1).max(10000).optional(),
  enabled: z.boolean().optional(),
  matchType: z.enum(["contains", "regex"]).optional(),
  pattern: z.string().min(1).max(160).optional(),
  accountId: z.string().min(6).max(128).optional().nullable(),
  minAmount: z.number().nonnegative().optional().nullable(),
  maxAmount: z.number().nonnegative().optional().nullable(),
  categoryId: z.string().min(6).max(128).optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
  }
  const parsed = updateRuleSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await categoryRulesRepo.findByIdForUser(id, auth.userId);

  if (!existing) {
    return NextResponse.json({ error: "Regra nao encontrada" }, { status: 404 });
  }

  const rule = await categoryRulesRepo.update({
    id,
    userId: auth.userId,
    ...parsed.data
  });

  if (!rule) {
    return NextResponse.json({ error: "Regra nao encontrada" }, { status: 404 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(rule);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  await categoryRulesRepo.delete({
    id,
    userId: auth.userId
  });

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({ success: true });
}


