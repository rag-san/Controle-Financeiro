import test from "node:test";
import assert from "node:assert/strict";
import { resolveImportPreviewTotal } from "@/src/features/transactions/components/import-preview-total";

test("resolveImportPreviewTotal keeps default net for non-invoice imports", () => {
  const total = resolveImportPreviewTotal({
    documentType: "bank_statement",
    rows: [
      { description: "Salario", signedAmount: 1000, documentType: "bank_statement" },
      { description: "Mercado", signedAmount: -300, documentType: "bank_statement" }
    ]
  });

  assert.equal(total, 700);
});

test("resolveImportPreviewTotal uses invoicePurchaseTotal metadata when available", () => {
  const total = resolveImportPreviewTotal({
    documentType: "credit_card_invoice",
    metadata: {
      invoicePurchaseTotal: 1031.62
    },
    rows: [
      { description: "PAGAMENTO ON LINE", signedAmount: 609.27, documentType: "credit_card_invoice" },
      { description: "COMPRA LOJA XYZ", signedAmount: -1031.62, documentType: "credit_card_invoice" }
    ]
  });

  assert.equal(total, -1031.62);
});

test("resolveImportPreviewTotal removes likely payment rows when invoice metadata is missing", () => {
  const total = resolveImportPreviewTotal({
    documentType: "credit_card_invoice",
    rows: [
      { description: "PAGAMENTO ON LINE", signedAmount: 609.27, documentType: "credit_card_invoice" },
      { description: "COMPRA LOJA XYZ", signedAmount: -1031.62, documentType: "credit_card_invoice" },
      { description: "COMPRA MERCADO", signedAmount: -120, documentType: "credit_card_invoice" }
    ]
  });

  assert.equal(total, -1151.62);
});

test("resolveImportPreviewTotal keeps positive credits like estorno in invoice net", () => {
  const total = resolveImportPreviewTotal({
    documentType: "credit_card_invoice",
    rows: [
      { description: "COMPRA LOJA XYZ", signedAmount: -200, documentType: "credit_card_invoice" },
      { description: "ESTORNO COMPRA LOJA XYZ", signedAmount: 50, documentType: "credit_card_invoice" }
    ]
  });

  assert.equal(total, -150);
});

