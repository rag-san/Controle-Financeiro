import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinancialBreakdown,
  type FinancialEntryLike
} from "@/lib/finance/financial-breakdown";

function entry(input: Omit<Partial<FinancialEntryLike>, "postedAt"> & {
  id: string;
  postedAt: string | Date;
  amountCents: number;
  type: FinancialEntryLike["type"];
}): FinancialEntryLike {
  return {
    id: input.id,
    postedAt: input.postedAt instanceof Date ? input.postedAt : new Date(input.postedAt),
    amountCents: input.amountCents,
    type: input.type,
    direction: input.direction ?? "OUT",
    accountId: input.accountId ?? null,
    accountType: input.accountType ?? null,
    accountName: input.accountName ?? null,
    creditCardAccountId: input.creditCardAccountId ?? null,
    creditCardAccountName: input.creditCardAccountName ?? null,
    categoryId: input.categoryId ?? null,
    raw: input.raw ?? null,
    isInternalTransfer: input.isInternalTransfer ?? false
  };
}

test("financial breakdown separates paid expense, card spending and future installments without duplication", () => {
  const entries: FinancialEntryLike[] = [
    entry({
      id: "inst-1",
      postedAt: "2026-01-05T12:00:00.000Z",
      amountCents: 10000,
      type: "cc_purchase",
      creditCardAccountId: "card-1",
      creditCardAccountName: "Cartao principal",
      categoryId: "cat-market",
      raw: {
        installmentCurrent: 1,
        installmentTotal: 3,
        installmentRemaining: 2,
        installmentBaseNormalizedDescription: "LOJA PARCELADA"
      }
    }),
    entry({
      id: "inst-2",
      postedAt: "2026-02-05T12:00:00.000Z",
      amountCents: 10000,
      type: "cc_purchase",
      creditCardAccountId: "card-1",
      creditCardAccountName: "Cartao principal",
      categoryId: "cat-market",
      raw: {
        installmentCurrent: 2,
        installmentTotal: 3,
        installmentRemaining: 1,
        installmentBaseNormalizedDescription: "LOJA PARCELADA"
      }
    }),
    entry({
      id: "cash-expense",
      postedAt: "2026-02-10T12:00:00.000Z",
      amountCents: 6000,
      type: "expense",
      accountId: "checking-1",
      accountType: "checking",
      accountName: "Conta principal",
      categoryId: "cat-bills"
    }),
    entry({
      id: "card-payment",
      postedAt: "2026-02-11T12:00:00.000Z",
      amountCents: 10000,
      type: "cc_payment",
      direction: "OUT",
      accountId: "checking-1",
      accountType: "checking",
      accountName: "Conta principal",
      creditCardAccountId: "card-1",
      creditCardAccountName: "Cartao principal"
    }),
    entry({
      id: "transfer-out",
      postedAt: "2026-02-12T12:00:00.000Z",
      amountCents: 3000,
      type: "transfer",
      direction: "OUT",
      accountId: "checking-1",
      accountType: "checking",
      accountName: "Conta principal",
      isInternalTransfer: true
    }),
    entry({
      id: "transfer-in",
      postedAt: "2026-02-12T12:00:00.000Z",
      amountCents: 3000,
      type: "transfer",
      direction: "IN",
      accountId: "cash-1",
      accountType: "cash",
      accountName: "Carteira",
      isInternalTransfer: true
    })
  ];

  const breakdown = buildFinancialBreakdown(entries, {
    currentFrom: new Date("2026-02-01T00:00:00.000Z"),
    currentTo: new Date("2026-02-28T23:59:59.999Z")
  });

  assert.equal(breakdown.classifiedExpense, 160);
  assert.equal(breakdown.paidExpense, 160);
  assert.equal(breakdown.directCashExpense, 60);
  assert.equal(breakdown.cardSpending, 100);
  assert.equal(breakdown.cardPayments, 100);
  assert.equal(breakdown.internalTransfersOut, 30);
  assert.equal(breakdown.internalTransfersIn, 30);
  assert.equal(breakdown.openCardDebt, 100);
  assert.equal(breakdown.futureInstallments, 100);
  assert.equal(breakdown.futureCommitted, 200);
  assert.deepEqual(breakdown.cards, [
    {
      creditCardAccountId: "card-1",
      creditCardName: "Cartao principal",
      spending: 100,
      payments: 100,
      openDebt: 100,
      futureInstallments: 100,
      totalCommitted: 200
    }
  ]);
});
