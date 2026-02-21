import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { recurringRepo } from "@/lib/server/recurring.repo";

const updateRecurringSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  categoryId: z.string().min(6).max(128).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
  lastPaidAt: z.string().optional().nullable()
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
  const parsed = updateRecurringSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const recurring = recurringRepo.update({
    id,
    userId: auth.userId,
    name: parsed.data.name,
    amount: parsed.data.amount !== undefined ? Number(parsed.data.amount) : undefined,
    dueDay: parsed.data.dueDay,
    categoryId: parsed.data.categoryId,
    status: parsed.data.status,
    lastPaidAt: parsed.data.lastPaidAt ? new Date(parsed.data.lastPaidAt) : parsed.data.lastPaidAt === null ? null : undefined
  });

  if (!recurring) {
    return NextResponse.json({ error: "Item recorrente nao encontrado" }, { status: 404 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(recurring);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  recurringRepo.delete({ id, userId: auth.userId });
  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({ success: true });
}


