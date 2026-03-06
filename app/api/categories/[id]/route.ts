import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { categoriesRepo } from "@/lib/server/categories.repo";

const updateCategorySchema = z.object({
  name: z.string().min(2).max(80).optional(),
  color: z.string().min(4).max(32).optional(),
  icon: z.string().max(50).optional().nullable(),
  parentId: z.string().min(6).max(128).optional().nullable()
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
    return NextResponse.json({ error: "Payload JSON inválido" }, { status: 400 });
  }
  const parsed = updateCategorySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await categoriesRepo.findByIdForUser(id, auth.userId);

  if (!existing) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  const category = await categoriesRepo.update({
    id,
    userId: auth.userId,
    ...parsed.data
  });

  if (!category) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(category);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  await categoriesRepo.clearParentForChildren({
    userId: auth.userId,
    parentId: id
  });

  await categoriesRepo.delete({
    id,
    userId: auth.userId
  });

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({ success: true });
}

