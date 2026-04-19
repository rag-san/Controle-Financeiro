import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLegacyFinancialTransaction,
  sumBudgetMetrics,
  sumCashFlowMetrics
} from "@/lib/finance/normalized-transactions";

function createLegacyTransaction(input: {
  id: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  description: string;
  accountType?: "checking" | "cash" | "credit" | "investment";
  categoryName?: string | null;
  raw?: Record<string, unknown>;
  isInternalTransfer?: boolean;
}) {
  return {
    id: input.id,
    date: new Date("2026-02-10T12:00:00.000Z"),
    description: input.description,
    amount: input.amount,
    type: input.type,
    category: input.categoryName
      ? {
          name: input.categoryName
        }
      : null,
    raw: input.raw ?? null,
    excluded: false,
    isInternalTransfer: input.isInternalTransfer ?? false,
    accountId: `${input.id}-account`,
    account: {
      id: `${input.id}-account`,
      name: `${input.id}-account`,
      type: input.accountType ?? "checking",
      institution: "QA",
      currency: "BRL",
      parentAccountId: null
    }
  };
}

test("normalized transactions classify real expense, card payment, transfer, refund and credit adjustment correctly", () => {
  const debitExpense = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "debit",
      amount: -42.5,
      type: "expense",
      description: "Compra no debito mercado"
    })
  );
  assert.equal(debitExpense.nature, "expense");
  assert.equal(debitExpense.budgetImpact, "counts_as_expense");
  assert.equal(debitExpense.budgetSignedAmount, -42.5);
  assert.equal(debitExpense.overallCashFlowSignedAmount, -42.5);

  const cardPayment = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "card-payment",
      amount: -400,
      type: "expense",
      description: "Pagamento fatura cartao Inter",
      raw: { transferDetectedFromCardPayment: true }
    })
  );
  assert.equal(cardPayment.nature, "credit_card_payment");
  assert.equal(cardPayment.budgetImpact, "ignore_for_budget");
  assert.equal(cardPayment.budgetSignedAmount, 0);
  assert.equal(cardPayment.overallCashFlowSignedAmount, -400);

  const transfer = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "transfer",
      amount: -500,
      type: "transfer",
      description: "PIX entre contas",
      isInternalTransfer: true
    })
  );
  assert.equal(transfer.nature, "internal_transfer");
  assert.equal(transfer.budgetImpact, "ignore_for_budget");
  assert.equal(transfer.overallCashFlowSignedAmount, 0);

  const creditAdjustment = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "credit-adjustment",
      amount: 100,
      type: "income",
      description: "Pix no credito"
    })
  );
  assert.equal(creditAdjustment.nature, "credit_adjustment");
  assert.equal(creditAdjustment.budgetImpact, "ignore_for_budget");
  assert.equal(creditAdjustment.overallCashFlowSignedAmount, 0);

  const refund = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "refund",
      amount: 60,
      type: "income",
      description: "Estorno mercado"
    })
  );
  assert.equal(refund.nature, "refund");
  assert.equal(refund.budgetImpact, "counts_as_expense");
  assert.equal(refund.budgetSignedAmount, 60);
  assert.equal(refund.overallCashFlowSignedAmount, 60);
});

test("normalized transactions keep transfer category out of budget while preserving cash flow", () => {
  const transferOut = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "categorized-transfer-out",
      amount: -1713,
      type: "expense",
      description: "Cp :10573521-Gabriel Paranhos Silva",
      categoryName: "Transferencias"
    })
  );
  const transferIn = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "categorized-transfer-in",
      amount: 1713,
      type: "income",
      description: "Cp :18236120-Edio Paranhos Lima",
      categoryName: "Transferencias"
    })
  );

  assert.equal(transferOut.nature, "expense");
  assert.equal(transferOut.budgetImpact, "ignore_for_budget");
  assert.equal(transferOut.budgetSignedAmount, 0);
  assert.equal(transferOut.overallCashFlowSignedAmount, -1713);
  assert.equal(transferIn.nature, "income");
  assert.equal(transferIn.budgetImpact, "ignore_for_budget");
  assert.equal(transferIn.overallCashFlowSignedAmount, 1713);

  const budget = sumBudgetMetrics([transferOut, transferIn]);
  assert.deepEqual(budget, {
    income: 0,
    expense: 0,
    net: 0
  });
});

test("normalized transactions keep card purchases in budget while removing them from cash flow", () => {
  const salary = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "salary",
      amount: 1000,
      type: "income",
      description: "Salario"
    })
  );
  const debitExpense = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "debit-expense",
      amount: -200,
      type: "expense",
      description: "Uber viagem"
    })
  );
  const creditPurchase = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "credit-purchase",
      amount: -300,
      type: "expense",
      description: "Compra cartao mercado",
      accountType: "credit"
    })
  );
  const cardPayment = normalizeLegacyFinancialTransaction(
    createLegacyTransaction({
      id: "card-payment",
      amount: -300,
      type: "expense",
      description: "Pagamento fatura cartao",
      raw: { transferDetectedFromCardPayment: true }
    })
  );

  const budget = sumBudgetMetrics([salary, debitExpense, creditPurchase, cardPayment]);
  assert.deepEqual(budget, {
    income: 1000,
    expense: 500,
    net: 500
  });

  const consolidatedCashFlow = sumCashFlowMetrics([salary, debitExpense, creditPurchase, cardPayment]);
  assert.deepEqual(consolidatedCashFlow, {
    inflow: 1000,
    outflow: 500,
    net: 500
  });

  const creditScopedCashFlow = sumCashFlowMetrics([creditPurchase], {
    scopedAccountId: creditPurchase.accountId,
    scopedAccountType: "credit"
  });
  assert.deepEqual(creditScopedCashFlow, {
    inflow: 0,
    outflow: 0,
    net: 0
  });
});
