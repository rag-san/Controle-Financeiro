import test from "node:test";
import assert from "node:assert/strict";
import { classifyPdfText, parsePdfImport } from "@/lib/pdf";

test("classifyPdfText detects Inter statement", () => {
  const result = classifyPdfText(`
    Banco Inter
    Extrato conta corrente
    Saldo do dia
    Pix recebido
  `);

  assert.equal(result.documentType, "bank_statement");
  assert.equal(result.issuerProfile, "inter_statement");
});

test("parsePdfImport captures Inter statement balance after each row", async () => {
  const fakePdf = Buffer.from(
    [
      "(Banco Inter) Tj",
      "(Extrato conta corrente) Tj",
      "(Saldo do dia) Tj",
      "(Pix recebido) Tj",
      "(20 de janeiro de 2026) Tj",
      "(Compra no debito: Loja Exemplo -R$ 50,00 -R$ 49,98) Tj",
      "(Pix recebido: Pessoa Exemplo R$ 50,00 R$ 0,02) Tj"
    ].join("\n"),
    "latin1"
  );

  const parsed = await parsePdfImport(fakePdf);

  assert.equal(parsed.documentType, "bank_statement");
  assert.equal(parsed.issuerProfile, "inter_statement");
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0]?.amount, -50);
  assert.equal(parsed.transactions[0]?.balanceAfter, -49.98);
  assert.equal(parsed.transactions[1]?.amount, 50);
  assert.equal(parsed.transactions[1]?.balanceAfter, 0.02);
});

test("classifyPdfText detects Inter invoice", () => {
  const result = classifyPdfText(`
    BANCO INTER
    Despesas da fatura
    Vencimento
  `);

  assert.equal(result.documentType, "credit_card_invoice");
  assert.equal(result.issuerProfile, "inter_invoice");
});

test("classifyPdfText detects Mercado Pago invoice", () => {
  const result = classifyPdfText(`
    Mercado Pago
    Detalhes de consumo
    Fatura
  `);

  assert.equal(result.documentType, "credit_card_invoice");
  assert.equal(result.issuerProfile, "mercado_pago_invoice");
});

test("classifyPdfText detects Mercado Pago statement", () => {
  const result = classifyPdfText(`
    EXTRATO DE CONTA
    DETALHE DOS MOVIMENTOS
    Data Descrição ID da operação Valor Saldo
    Mercado Pago Instituição de Pagamento
  `);

  assert.equal(result.documentType, "bank_statement");
  assert.equal(result.issuerProfile, "mercado_pago_statement");
});

test("classifyPdfText detects Nubank invoice", () => {
  const result = classifyPdfText(`
    Nubank
    Fatura
    Data de vencimento
    Período vigente
  `);

  assert.equal(result.documentType, "credit_card_invoice");
  assert.equal(result.issuerProfile, "nubank_invoice");
});

test("parsePdfImport captures Nubank invoice totals for reconciliation", async () => {
  const fakePdf = Buffer.from(
    [
      "(Nubank) Tj",
      "(Fatura) Tj",
      "(Data de vencimento: 18 FEV 2026) Tj",
      "(Periodo vigente) Tj",
      "(RESUMO DA FATURA ATUAL) Tj",
      "(Total de compras de todos os cartoes, 09 JAN a 09 FEV R$ 373,97) Tj",
      "(Pagamento recebido -R$ 1.616,82) Tj",
      "(Total a pagar -R$ 0,03) Tj",
      "(09 JAN Compra Mercado R$ 200,00) Tj",
      "(10 JAN Compra Farmacia R$ 173,97) Tj"
    ].join("\n"),
    "latin1"
  );

  const parsed = await parsePdfImport(fakePdf);

  assert.equal(parsed.documentType, "credit_card_invoice");
  assert.equal(parsed.issuerProfile, "nubank_invoice");
  assert.equal(parsed.metadata.invoicePurchaseTotal, 373.97);
  assert.equal(parsed.metadata.invoicePaymentTotal, 1616.82);
  assert.equal(parsed.metadata.invoiceTotalDue, -0.03);
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions.reduce((sum, row) => sum + row.amount, 0), -373.97);
});

test("classifyPdfText returns unknown issuer for generic invoice", () => {
  const result = classifyPdfText(`
    Fatura
    Vencimento
    Banco Exemplo
  `);

  assert.equal(result.documentType, "credit_card_invoice");
  assert.equal(result.issuerProfile, "unknown");
});

test("classifyPdfText returns unknown issuer for generic statement", () => {
  const result = classifyPdfText(`
    Extrato
    Saldo do dia
    Banco Exemplo
  `);

  assert.equal(result.documentType, "bank_statement");
  assert.equal(result.issuerProfile, "unknown");
});
