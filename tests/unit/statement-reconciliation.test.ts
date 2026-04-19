import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAccountStatement } from "@/lib/finance/statement-reconciliation";

test("statement reconciliation accepts a perfectly balanced checking account statement", () => {
  const result = reconcileAccountStatement([
    {
      accountId: "checking-1",
      accountType: "checking",
      date: new Date("2026-02-01T12:00:00.000Z"),
      sequence: 0,
      amount: 1000,
      balanceAfter: 1000,
      description: "Salario"
    },
    {
      accountId: "checking-1",
      accountType: "checking",
      date: new Date("2026-02-02T12:00:00.000Z"),
      sequence: 1,
      amount: -200,
      balanceAfter: 800,
      description: "Mercado"
    },
    {
      accountId: "checking-1",
      accountType: "checking",
      date: new Date("2026-02-03T12:00:00.000Z"),
      sequence: 2,
      amount: -799.16,
      balanceAfter: 0.84,
      description: "Pagamento"
    }
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.checkedAccountCount, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.accounts[0]?.openingBalance, 0);
  assert.equal(result.accounts[0]?.closingBalance, 0.84);
  assert.equal(result.accounts[0]?.computedClosingBalance, 0.84);
});

test("statement reconciliation rejects mismatched balanceAfter anchors", () => {
  const result = reconcileAccountStatement([
    {
      accountId: "checking-1",
      accountType: "checking",
      date: new Date("2026-02-01T12:00:00.000Z"),
      sequence: 0,
      amount: 1000,
      balanceAfter: 1000,
      description: "Salario"
    },
    {
      accountId: "checking-1",
      accountType: "checking",
      date: new Date("2026-02-02T12:00:00.000Z"),
      sequence: 1,
      amount: -200,
      balanceAfter: 850,
      description: "Mercado"
    }
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.mismatchCount, 1);
  assert.equal(result.accounts[0]?.mismatchCount, 1);
  assert.equal(result.accounts[0]?.mismatches[0]?.expectedBalanceAfter, 800);
  assert.equal(result.accounts[0]?.mismatches[0]?.actualBalanceAfter, 850);
  assert.equal(result.accounts[0]?.mismatches[0]?.delta, -50);
});
