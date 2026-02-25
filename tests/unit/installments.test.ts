import test from "node:test";
import assert from "node:assert/strict";
import { extractInstallmentInfo, hasInstallmentMarker, stripInstallmentMarker } from "@/lib/installments";

test("extractInstallmentInfo parses 'Parcela X de Y' and strips marker", () => {
  const info = extractInstallmentInfo("NowTech (Parcela 06 de 06)");

  assert.ok(info);
  assert.equal(info.currentInstallment, 6);
  assert.equal(info.totalInstallments, 6);
  assert.equal(info.remainingInstallments, 0);
  assert.equal(info.marker, "6/6");
  assert.equal(info.baseDescription, "NowTech");
  assert.equal(info.normalizedBaseDescription, "NOWTECH");
});

test("extractInstallmentInfo parses compact 'parc X/Y' format", () => {
  const info = extractInstallmentInfo("Loja XPTO parc 2/10");

  assert.ok(info);
  assert.equal(info.currentInstallment, 2);
  assert.equal(info.totalInstallments, 10);
  assert.equal(info.remainingInstallments, 8);
  assert.equal(info.baseDescription, "Loja XPTO");
});

test("extractInstallmentInfo parses aliases like PCLA and hyphen notation", () => {
  const info = extractInstallmentInfo("Notebook Gamer PCLA 03-12");

  assert.ok(info);
  assert.equal(info.currentInstallment, 3);
  assert.equal(info.totalInstallments, 12);
  assert.equal(info.remainingInstallments, 9);
  assert.equal(info.marker, "3/12");
  assert.equal(info.baseDescription, "Notebook Gamer");
});

test("installment helpers return no marker for normal purchases", () => {
  assert.equal(hasInstallmentMarker("Supermercado Bairro"), false);
  assert.equal(stripInstallmentMarker("Supermercado Bairro"), "Supermercado Bairro");
  assert.equal(extractInstallmentInfo("Supermercado Bairro"), null);
});
