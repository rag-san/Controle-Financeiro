import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { deleteLedgerForLegacyTransactions } from "@/lib/server/ledger-sync.service";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

const updateAccountSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  type: z.enum(["checking", "credit", "cash", "investment"]).optional(),
  institution: z.string().max(120).optional().nullable(),
  currency: z.string().length(3).optional(),
  parentAccountId: z.string().min(6).max(128).optional().nullable()
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
  const parsed = updateAccountSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await accountsRepo.findByIdForUser(id, auth.userId);

  if (!existing) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  let account;
  try {
    account = await accountsRepo.update({
      id,
      userId: auth.userId,
      ...parsed.data,
      currency: parsed.data.currency?.toUpperCase(),
      parentAccountId: parsed.data.parentAccountId
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["PARENT_ACCOUNT_NOT_FOUND", "PARENT_ACCOUNT_INVALID_TYPE", "PARENT_ACCOUNT_SELF_REFERENCE"].includes(
        error.message
      )
    ) {
      return NextResponse.json({ error: "Conta mae invalida para este cadastro." }, { status: 400 });
    }
    throw error;
  }

  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
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
  const existing = await accountsRepo.findByIdForUser(id, auth.userId);

  if (!existing) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  const allAccounts = await accountsRepo.listByUser(auth.userId);
  const linkedChildren = allAccounts.filter((account) => account.parentAccountId === id);
  if (linkedChildren.length > 0) {
    return NextResponse.json(
      {
        error: "Não é possível excluir conta mãe com cartões vinculados. Reatribua ou remova os cartões primeiro."
      },
      { status: 409 }
    );
  }

  const transactionCount = await transactionsRepo.countByAccount(auth.userId, id);
  let deletedTransactions = 0;
  let deletedLedgerEntriesByTransactions = 0;
  if (transactionCount > 0) {
    const accountTransactions = await transactionsRepo.listAll({
      userId: auth.userId,
      accountId: id
    });
    const cascadeIds = await transactionsRepo.resolveCascadeDeleteIdsForUser(
      accountTransactions.map((transaction) => transaction.id),
      auth.userId
    );

    if (cascadeIds.length > 0) {
      deletedTransactions = await transactionsRepo.deleteManyByIdsForUser(cascadeIds, auth.userId);
      const ledgerDeleteResult = await deleteLedgerForLegacyTransactions({
        userId: auth.userId,
        transactionIds: cascadeIds
      });
      deletedLedgerEntriesByTransactions = ledgerDeleteResult.deleted;
    }
  }

  const deletedLedgerEntriesByAccount = await ledgerRepo.deleteEntriesByAccountRef(auth.userId, id);
  const deletedLedgerEntries = deletedLedgerEntriesByAccount + deletedLedgerEntriesByTransactions;

  const deleted = await accountsRepo.delete({ id, userId: auth.userId });
  if (deleted === 0) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json({ success: true, deletedTransactions, deletedLedgerEntries });
}
