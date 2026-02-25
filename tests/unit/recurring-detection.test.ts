import test from "node:test";
import assert from "node:assert/strict";
import type { ReportPreparedTransaction } from "@/src/features/reports/types";
import { detectRecurringMerchants } from "@/src/features/reports/utils/recurringDetection";

function tx(input: {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchantKey: string;
}): ReportPreparedTransaction {
  const date = new Date(`${input.date}T12:00:00.000Z`);
  return {
    id: input.id,
    date,
    timestamp: date.getTime(),
    amount: -Math.abs(input.amount),
    absAmount: Math.abs(input.amount),
    type: "expense",
    description: input.description,
    accountId: "acc-1",
    accountName: "Cartao QA",
    categoryId: "cat-1",
    parentCategoryId: null,
    parentCategoryName: null,
    categoryName: "Compras",
    categoryColor: "#3b82f6",
    categoryIcon: null,
    merchantKey: input.merchantKey
  };
}

test("detectRecurringMerchants ignores installment purchases", () => {
  const period = {
    preset: "3M" as const,
    label: "3 meses",
    start: new Date("2026-01-01T00:00:00.000Z"),
    end: new Date("2026-03-31T23:59:59.999Z")
  };

  const transactions = [
    tx({
      id: "1",
      date: "2026-01-08",
      amount: 80.01,
      description: "NowTech (Parcela 01 de 06)",
      merchantKey: "nowtech"
    }),
    tx({
      id: "2",
      date: "2026-02-08",
      amount: 80.01,
      description: "NowTech (Parcela 02 de 06)",
      merchantKey: "nowtech"
    }),
    tx({
      id: "3",
      date: "2026-03-08",
      amount: 80.01,
      description: "NowTech (Parcela 03 de 06)",
      merchantKey: "nowtech"
    })
  ];

  const detected = detectRecurringMerchants(transactions, period);
  assert.equal(detected.length, 0);
});

test("detectRecurringMerchants still detects true recurring expenses", () => {
  const period = {
    preset: "3M" as const,
    label: "3 meses",
    start: new Date("2026-01-01T00:00:00.000Z"),
    end: new Date("2026-03-31T23:59:59.999Z")
  };

  const transactions = [
    tx({
      id: "1",
      date: "2026-01-05",
      amount: 39.9,
      description: "Netflix Mensalidade",
      merchantKey: "netflix"
    }),
    tx({
      id: "2",
      date: "2026-02-05",
      amount: 39.9,
      description: "Netflix Mensalidade",
      merchantKey: "netflix"
    }),
    tx({
      id: "3",
      date: "2026-03-05",
      amount: 39.9,
      description: "Netflix Mensalidade",
      merchantKey: "netflix"
    })
  ];

  const detected = detectRecurringMerchants(transactions, period);
  assert.equal(detected.length, 1);
  assert.equal(detected[0]?.merchantKey, "netflix");
});
