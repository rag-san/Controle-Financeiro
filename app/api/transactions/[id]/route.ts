import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { isValidFlexibleDate, normalizeDescription, parseFlexibleDate } from "@/lib/normalize";
import { parseMoneyInput } from "@/lib/money";
import { accountsRepo } from "@/lib/server/accounts.repo";
import {
  deleteLedgerForLegacyTransactions,
  syncLedgerForLegacyTransactions
} from "@/lib/server/ledger-sync.service";
import { transactionsRepo } from "@/lib/server/transactions.repo";

const updateTransactionSchema = z.object({
  accountId: z.string().min(6).max(128).optional(),
  categoryId: z.string().min(6).max(128).nullable().optional(),
  date: z
    .string()
    .optional()
    .refine((value) => value === undefined || isValidFlexibleDate(value), {
      message: "Data invalida"
    }),
  description: z.string().min(2).max(180).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  type: z.enum(["income", "expense"]).optional(),
  status: z.enum(["posted", "pending"]).optional()
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
  const parsed = updateTransactionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await transactionsRepo.findByIdForUser(id, auth.userId);

  if (!existing) {
    return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 });
  }

  if (existing.type === "transfer") {
    return NextResponse.json(
      {
        error: "Transações de transferência não podem ser editadas. Exclua e recrie o par."
      },
      { status: 409 }
    );
  }

  if (parsed.data.accountId) {
    const nextAccount = await accountsRepo.findByIdForUser(parsed.data.accountId, auth.userId);
    if (!nextAccount) {
      return NextResponse.json({ error: "Conta informada não foi encontrada." }, { status: 400 });
    }
    if (nextAccount.type === "credit") {
      return NextResponse.json(
        {
          error:
            "Transações manuais não podem ser movidas para conta de cartão de crédito. Use importação de fatura ou transferência."
        },
        { status: 400 }
      );
    }
  }

  let amount = parsed.data.amount !== undefined ? parseMoneyInput(parsed.data.amount) : existing.amount;

  if (parsed.data.type === "expense") {
    amount = amount > 0 ? -amount : amount;
  }
  if (parsed.data.type === "income") {
    amount = amount < 0 ? Math.abs(amount) : amount;
  }

  const description = parsed.data.description ?? existing.description;

  const transaction = await transactionsRepo.update({
    id,
    userId: auth.userId,
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId,
    date: parsed.data.date ? parseFlexibleDate(parsed.data.date) : undefined,
    description,
    normalizedDescription: normalizeDescription(description),
    amount,
    type: amount >= 0 ? "income" : "expense",
    status: parsed.data.status
  });

  if (!transaction) {
    return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 });
  }

  await syncLedgerForLegacyTransactions({
    userId: auth.userId,
    transactionIds: [transaction.id]
  });

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(transaction);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const cascadeIds = await transactionsRepo.resolveCascadeDeleteIdsForUser([id], auth.userId);
  await transactionsRepo.deleteByIdForUser(id, auth.userId);
  await deleteLedgerForLegacyTransactions({
    userId: auth.userId,
    transactionIds: cascadeIds
  });

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({ success: true });
}
