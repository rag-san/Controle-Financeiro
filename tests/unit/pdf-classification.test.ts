import test from "node:test";
import assert from "node:assert/strict";
import { classifyPdfText } from "@/lib/pdf";

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
