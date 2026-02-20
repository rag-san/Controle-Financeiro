import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

const updateAccountSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  type: z.enum(["checking", "credit", "cash", "investment"]).optional(),
  institution: z.string().max(120).optional().nullable(),
  currency: z.string().length(3).optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const payload = await request.json();
  const parsed = updateAccountSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = accountsRepo.findByIdForUser(id, auth.userId);

  if (!existing) {
    return NextResponse.json({ error: "Conta nao encontrada" }, { status: 404 });
  }

  const account = accountsRepo.update({
    id,
    userId: auth.userId,
    ...parsed.data,
    currency: parsed.data.currency?.toUpperCase()
  });

  if (!account) {
    return NextResponse.json({ error: "Conta nao encontrada" }, { status: 404 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(account);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const transactionCount = transactionsRepo.countByAccount(auth.userId, id);

  if (transactionCount > 0) {
    return NextResponse.json(
      { error: "Nao e possivel excluir conta com transacoes vinculadas" },
      { status: 409 }
    );
  }

  accountsRepo.delete({ id, userId: auth.userId });

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({ success: true });
}


