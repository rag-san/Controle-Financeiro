import assert from "node:assert/strict";
import test from "node:test";
import { buildSankeyModel } from "@/src/features/reports/sankey/buildSankeyModel";
import type { ReportPreparedTransaction } from "@/src/features/reports/types";

function tx(input: Partial<ReportPreparedTransaction> & Pick<ReportPreparedTransaction, "id">): ReportPreparedTransaction {
  return {
    id: input.id,
    date: input.date ?? new Date("2026-02-10T12:00:00.000Z"),
    timestamp: input.timestamp ?? new Date("2026-02-10T12:00:00.000Z").getTime(),
    amount: input.amount ?? 0,
    absAmount: input.absAmount ?? Math.abs(input.amount ?? 0),
    type: input.type ?? "expense",
    incomeCents: input.incomeCents ?? 0,
    expenseCents: input.expenseCents ?? 0,
    description: input.description ?? "",
    accountId: input.accountId ?? "acc_1",
    accountName: input.accountName ?? "Conta",
    categoryId: input.categoryId ?? null,
    parentCategoryId: input.parentCategoryId ?? null,
    parentCategoryName: input.parentCategoryName ?? null,
    categoryName: input.categoryName ?? "Sem categoria",
    categoryColor: input.categoryColor ?? "#94a3b8",
    categoryIcon: input.categoryIcon ?? null,
    merchantKey: input.merchantKey ?? "merchant"
  };
}

test("buildSankeyModel surfaces saved flow and hides transfer-like categories from highlights", () => {
  const model = buildSankeyModel(
    [
      tx({
        id: "income",
        type: "income",
        amount: 1000,
        absAmount: 1000,
        incomeCents: 100_000,
        categoryName: "Receita"
      }),
      tx({
        id: "market",
        expenseCents: 20_000,
        amount: 200,
        absAmount: 200,
        categoryName: "Mercado",
        categoryColor: "#22c55e"
      }),
      tx({
        id: "transfer",
        expenseCents: 15_000,
        amount: 150,
        absAmount: 150,
        categoryName: "Transferências",
        categoryColor: "#ef4444"
      })
    ],
    { topCategories: 4, topSubcategoriesPerCategory: 0 }
  );

  assert.equal(model.totalIncome, 1000);
  assert.equal(model.totalExpense, 350);
  assert.equal(model.netSaved, 650);
  assert.equal(model.hiddenOperationalCount, 1);
  assert.equal(model.hiddenOperationalExpense, 150);

  const savedNode = model.nodes.find((node) => node.kind === "saved");
  assert.ok(savedNode);
  assert.equal(savedNode?.label, "Economizado");

  const transferCategoryNode = model.nodes.find(
    (node) => node.kind === "category" && /transfer/i.test(node.label)
  );
  assert.equal(transferCategoryNode, undefined);

  const othersNode = model.nodes.find(
    (node) => node.kind === "category" && node.label === "Outras categorias"
  );
  assert.ok(othersNode);
});
