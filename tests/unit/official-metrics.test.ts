import test from "node:test";
import assert from "node:assert/strict";
import {
  accumulateOfficialFlow,
  accumulateOfficialFlowCents,
  fromAmountCents,
  toAmountCents,
  totalsFromGroupedTypes
} from "@/lib/finance/official-metrics";

test("official metrics ignore transfers in income/expense totals", () => {
  const totals = accumulateOfficialFlow([
    { type: "income", amount: 1000 },
    { type: "expense", amount: -250.4 },
    { type: "transfer", amount: -500 },
    { type: "transfer", amount: 500 }
  ]);

  assert.equal(totals.income, 1000);
  assert.equal(totals.expense, 250.4);
  assert.equal(totals.net, 749.6);
  assert.equal(totals.transfer, 1000);
});

test("official metrics keep cent-level precision", () => {
  const totals = accumulateOfficialFlowCents([
    { type: "income", amount: 0.1 },
    { type: "income", amount: 0.2 },
    { type: "expense", amount: -0.3 }
  ]);

  assert.equal(totals.incomeCents, 30);
  assert.equal(totals.expenseCents, 30);
  assert.equal(totals.netCents, 0);
  assert.equal(fromAmountCents(totals.incomeCents), 0.3);
});

test("totals from grouped rows preserve official rules", () => {
  const totals = totalsFromGroupedTypes([
    { type: "income", amount: 1500.56 },
    { type: "expense", amount: -120.1 },
    { type: "transfer", amount: -900 }
  ]);

  assert.equal(totals.income, 1500.56);
  assert.equal(totals.expense, 120.1);
  assert.equal(totals.net, 1380.46);
  assert.equal(toAmountCents(totals.transfer), 90000);
});
