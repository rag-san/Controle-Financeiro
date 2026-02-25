import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCsvRows, parseCsvBuffer, suggestCsvMapping } from "@/lib/csv";

test("parseCsvBuffer chooses transactional header when CSV has summary section first", () => {
  const sampleCsv = [
    "INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE",
    "9,13;3.265,95;-3.274,74;0,34",
    "",
    "RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE",
    "07-01-2026;Transferência Pix recebida GABRIEL;141018819732;1.894,00;1.903,13",
    "08-01-2026;Pagamento Cartão de crédito;141130666804;-321,74;1.081,39"
  ].join("\n");

  const parsed = parseCsvBuffer(Buffer.from(sampleCsv, "utf8"));
  const mapping = suggestCsvMapping(parsed.columns);

  assert.equal(mapping.date, "RELEASE_DATE");
  assert.ok(
    mapping.description === "TRANSACTION_TYPE" || mapping.history === "TRANSACTION_TYPE",
    "Expected TRANSACTION_TYPE to be mapped to description or history"
  );
  assert.equal(mapping.amount, "TRANSACTION_NET_AMOUNT");

  const analysis = analyzeCsvRows(parsed.rows, {
    date: mapping.date ?? "",
    description: mapping.description ?? mapping.history ?? "",
    history: mapping.history,
    amount: mapping.amount,
    debit: mapping.debit,
    credit: mapping.credit,
    type: mapping.type,
    account: mapping.account,
    balanceAfter: mapping.balanceAfter
  });

  assert.ok(analysis.summary.validRows >= 2);
  assert.equal(analysis.summary.errorRows, 0);
  assert.equal(
    analysis.rows.filter((row) => Boolean(row.externalId)).length,
    analysis.rows.length,
    "Expected REFERENCE_ID to be mapped as externalId for all valid rows"
  );
});
