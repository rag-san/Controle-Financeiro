import assert from "node:assert/strict";
import test from "node:test";
import type { CategorizationRule } from "@/lib/categorizationRules";
import {
  categorizeImportRowDeterministic,
  type CategorizationHistorySample
} from "@/lib/import-categorization-deterministic";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { extractMerchantDescriptor } from "@/lib/import-text";

const categories = [
  { id: "cat-restaurants", name: "Restaurantes" },
  { id: "cat-groceries", name: "Supermercado" },
  { id: "cat-transfers", name: "Transferencias" },
  { id: "cat-fees", name: "Taxas e Encargos" },
  { id: "cat-income", name: "Renda" },
  { id: "cat-subscriptions", name: "Assinaturas" }
];

function importRow(input: {
  description: string;
  amount: number;
  transactionKindRaw?: string;
  counterpartyRaw?: string;
  type?: "income" | "expense" | "transfer";
}) {
  return toCanonicalImportRow({
    date: "2026-03-10",
    sourceType: "csv",
    description: input.description,
    amount: input.amount,
    transactionKindRaw: input.transactionKindRaw,
    counterpartyRaw: input.counterpartyRaw,
    type: input.type
  });
}

function rule(input: Partial<CategorizationRule> & { id: string; name: string; pattern: string; categoryId: string }): CategorizationRule {
  return {
    id: input.id,
    userId: "user-1",
    name: input.name,
    priority: input.priority ?? 100,
    enabled: input.enabled ?? true,
    matchType: input.matchType ?? "contains",
    pattern: input.pattern,
    accountId: input.accountId ?? null,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
    categoryId: input.categoryId
  };
}

test("merchant normalization collapses marketplace noise and strips payment processors", () => {
  const ifood = extractMerchantDescriptor("ifd*ifood pag*xyz");
  assert.equal(ifood.merchantKey, "ifood");
  assert.equal(ifood.processorOnly, false);

  const processorWrapped = extractMerchantDescriptor("Mercado Pago * Padaria Sao Jose");
  assert.equal(processorWrapped.merchantKey, "padaria sao jose");
  assert.deepEqual(processorWrapped.processorTokens, ["MERCADOPAGO"]);

  const processorOnly = extractMerchantDescriptor("PayPal");
  assert.equal(processorOnly.merchantKey, "paypal");
  assert.equal(processorOnly.processorOnly, true);
});

test("autocategorization uses trusted history and does not guess on processor-only descriptions", () => {
  const history: CategorizationHistorySample[] = [
    {
      merchantKey: "padaria sao jose",
      categoryId: "cat-restaurants",
      categorySource: "manual"
    },
    {
      merchantKey: "padaria sao jose",
      categoryId: "cat-restaurants",
      categorySource: "manual"
    }
  ];

  const exactHistory = categorizeImportRowDeterministic({
    row: importRow({
      description: "Mercado Pago * Padaria Sao Jose",
      amount: -22.5,
      transactionKindRaw: "Compra no debito",
      counterpartyRaw: "Mercado Pago * Padaria Sao Jose"
    }),
    userRules: [],
    categories,
    history
  });

  assert.equal(exactHistory.categoryId, "cat-restaurants");
  assert.equal(exactHistory.categorySource, "history");
  assert.equal(exactHistory.confidence, "high");

  const processorOnly = categorizeImportRowDeterministic({
    row: importRow({
      description: "Mercado Pago",
      amount: -22.5,
      transactionKindRaw: "Compra no debito",
      counterpartyRaw: "Mercado Pago"
    }),
    userRules: [],
    categories,
    history: []
  });

  assert.equal(processorOnly.categoryId, null);
  assert.equal(processorOnly.categorySource, "none");
  assert.equal(processorOnly.shouldReview, true);
  assert.match(processorOnly.reason ?? "", /intermediador de pagamento/i);
});

test("autocategorization marks conflicting history for review instead of forcing a category", () => {
  const history: CategorizationHistorySample[] = [
    {
      merchantKey: "loja centro",
      categoryId: "cat-restaurants",
      categorySource: "manual"
    },
    {
      merchantKey: "loja centro",
      categoryId: "cat-groceries",
      categorySource: "manual"
    }
  ];

  const result = categorizeImportRowDeterministic({
    row: importRow({
      description: "Loja Centro",
      amount: -45,
      transactionKindRaw: "Compra no debito",
      counterpartyRaw: "Loja Centro"
    }),
    userRules: [],
    categories,
    history
  });

  assert.equal(result.categoryId, null);
  assert.equal(result.categorySource, "none");
  assert.equal(result.shouldReview, true);
  assert.match(result.reason ?? "", /historico conflitante/i);
});

test("generic seeded rules do not override processor ambiguity, but builtin rules still catch fees", () => {
  const seededMarketRule = rule({
    id: "seeded-market",
    name: "Auto: Supermercado - MERCADO",
    pattern: "MERCADO",
    categoryId: "cat-groceries"
  });

  const processorWrapped = categorizeImportRowDeterministic({
    row: importRow({
      description: "Mercado Pago",
      amount: -80,
      transactionKindRaw: "Compra no debito",
      counterpartyRaw: "Mercado Pago"
    }),
    userRules: [seededMarketRule],
    categories,
    history: []
  });

  assert.equal(processorWrapped.categoryId, null);
  assert.equal(processorWrapped.categorySource, "none");

  const feeResult = categorizeImportRowDeterministic({
    row: importRow({
      description: "Tarifa de manutencao mensal",
      amount: -15,
      transactionKindRaw: "Tarifa",
      counterpartyRaw: "Banco"
    }),
    userRules: [seededMarketRule],
    categories,
    history: []
  });

  assert.equal(feeResult.categoryId, "cat-fees");
  assert.equal(feeResult.categorySource, "builtin_rule");
  assert.equal(feeResult.confidence, "high");
});
