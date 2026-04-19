import assert from "node:assert/strict";
import test from "node:test";
import { buildCategoryMonthAggregates } from "@/src/features/categories/utils/categoryAggregates";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";

test("buildCategoryMonthAggregates nets refund-like positive expense amounts from ledger categories", () => {
  const categories: CategoryDTO[] = [
    {
      id: "cat-groceries",
      name: "Mercado",
      color: "#22c55e",
      icon: "shopping-cart",
      parentId: null
    }
  ];

  const transactions: TransactionDTO[] = [
    {
      id: "tx-expense",
      accountId: "acc-1",
      categoryId: "cat-groceries",
      date: "2026-03-02T12:00:00.000Z",
      description: "Mercado compra",
      amount: -200,
      type: "expense",
      direction: "out",
      status: "posted",
      account: {
        id: "acc-1",
        name: "Conta Principal",
        type: "checking",
        currency: "BRL",
        institution: "Banco Teste",
        parentAccountId: null
      },
      category: categories[0]
    },
    {
      id: "tx-refund",
      accountId: "acc-1",
      categoryId: "cat-groceries",
      date: "2026-03-03T12:00:00.000Z",
      description: "Mercado estorno",
      amount: 50,
      type: "expense",
      direction: "in",
      status: "posted",
      account: {
        id: "acc-1",
        name: "Conta Principal",
        type: "checking",
        currency: "BRL",
        institution: "Banco Teste",
        parentAccountId: null
      },
      category: categories[0]
    }
  ];

  const aggregates = buildCategoryMonthAggregates(
    categories,
    transactions,
    new Date("2026-03-15T12:00:00.000Z")
  );

  assert.equal(aggregates.totalSpent, 150);
  assert.equal(aggregates.list[0]?.name, "Mercado");
  assert.equal(aggregates.list[0]?.value, 150);
});
