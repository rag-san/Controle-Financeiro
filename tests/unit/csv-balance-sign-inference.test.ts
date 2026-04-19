import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCsvRows, parseCsvBuffer, suggestCsvMapping, type CsvMapping } from "@/lib/csv";

function buildMapping(columns: string[]): CsvMapping {
  const suggested = suggestCsvMapping(columns);
  return {
    date: suggested.date ?? "",
    description: suggested.description ?? suggested.history ?? "",
    history: suggested.history,
    amount: suggested.amount,
    debit: suggested.debit,
    credit: suggested.credit,
    type: suggested.type,
    account: suggested.account,
    balanceAfter: suggested.balanceAfter
  };
}

test("CSV parser uses opening balance and balanceAfter to correct positive expense amounts", () => {
  const sampleCsv = [
    "SALDO INICIAL;1.000,00",
    "Data;Descricao;Valor;Saldo",
    "01/04/2026;Compra Mercado;100,00;900,00",
    "02/04/2026;Pix Recebido;50,00;950,00"
  ].join("\n");

  const parsed = parseCsvBuffer(Buffer.from(sampleCsv, "utf8"));
  const mapping = buildMapping(parsed.columns);
  const analysis = analyzeCsvRows(parsed.rows, mapping, {
    openingBalance: parsed.metadata.openingBalance
  });

  assert.equal(parsed.metadata.openingBalance, 1000);
  assert.equal(mapping.balanceAfter, "Saldo");
  assert.equal(analysis.summary.validRows, 2);
  assert.equal(analysis.rows[0]?.amount, -100);
  assert.equal(analysis.rows[0]?.type, "expense");
  assert.equal(analysis.rows[1]?.amount, 50);
  assert.equal(analysis.rows[1]?.type, "income");
  assert.equal(analysis.diagnostics[0]?.mapped?.amount, -100);
});

test("CSV parser can infer signs when statement rows are newest first", () => {
  const sampleCsv = [
    "SALDO INICIAL;1.000,00",
    "Data;Descricao;Valor;Saldo",
    "02/04/2026;Pix Recebido;50,00;950,00",
    "01/04/2026;Compra Mercado;100,00;900,00"
  ].join("\n");

  const parsed = parseCsvBuffer(Buffer.from(sampleCsv, "utf8"));
  const mapping = buildMapping(parsed.columns);
  const analysis = analyzeCsvRows(parsed.rows, mapping, {
    openingBalance: parsed.metadata.openingBalance
  });

  assert.equal(analysis.summary.validRows, 2);
  assert.equal(analysis.rows[0]?.description, "Pix Recebido");
  assert.equal(analysis.rows[0]?.amount, 50);
  assert.equal(analysis.rows[1]?.description, "Compra Mercado");
  assert.equal(analysis.rows[1]?.amount, -100);
});
