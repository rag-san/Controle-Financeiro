import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { parseStrictMoneyInput } from "@/lib/money";
import { isValidFlexibleDate, parseFlexibleDate } from "@/lib/normalize";
import { netWorthRepo } from "@/lib/server/net-worth.repo";

const moneyInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => parseStrictMoneyInput(value))
  .refine((value): value is number => value !== null, {
    message: "Valor invalido"
  });

const updateSchema = z.object({
  type: z.enum(["asset", "debt"]).optional(),
  name: z.string().min(2).max(100).optional(),
  value: moneyInputSchema.optional(),
  date: z
    .string()
    .optional()
    .refine((value) => value === undefined || isValidFlexibleDate(value), {
      message: "Data invalida"
    }),
  group: z.string().max(80).optional().nullable()
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
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = netWorthRepo.update({
    id,
    userId: auth.userId,
    type: parsed.data.type,
    name: parsed.data.name,
    value: parsed.data.value,
    date: parsed.data.date ? parseFlexibleDate(parsed.data.date) : undefined,
    group: parsed.data.group
  });

  if (!updated) {
    return NextResponse.json({ error: "Registro nao encontrado" }, { status: 404 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  netWorthRepo.delete({ id, userId: auth.userId });
  invalidateFinanceCaches(auth.userId);
  return NextResponse.json({ success: true });
}


