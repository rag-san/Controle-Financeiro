import test from "node:test";
import assert from "node:assert/strict";
import { resolveTransactionsHeaderSummary } from "@/src/features/transactions/transactions-summary";

test("resolveTransactionsHeaderSummary uses budget totals for transactions header cards", () => {
  const resolved = resolveTransactionsHeaderSummary({
    income: 0,
    expense: 1032.52,
    balance: -1032.52,
    netBudget: -1032.52,
    periodCashInflow: 0,
    periodCashOutflow: 0,
    periodCashFlow: 0,
    cashBalance: 0
  });

  assert.equal(resolved.periodCashInflow, 0);
  assert.equal(resolved.periodCashOutflow, 1032.52);
  assert.equal(resolved.periodCashFlow, -1032.52);
  assert.equal(resolved.cashBalance, -1032.52);
});

test("resolveTransactionsHeaderSummary keeps cash cards coherent when budget and cash differ", () => {
  const resolved = resolveTransactionsHeaderSummary({
    income: 800,
    expense: 350,
    balance: 450,
    netBudget: 450,
    periodCashInflow: 1200,
    periodCashOutflow: 600,
    periodCashFlow: 600,
    cashBalance: 900
  });

  assert.equal(resolved.periodCashInflow, 800);
  assert.equal(resolved.periodCashOutflow, 350);
  assert.equal(resolved.periodCashFlow, 450);
  assert.equal(resolved.cashBalance, 450);
});

