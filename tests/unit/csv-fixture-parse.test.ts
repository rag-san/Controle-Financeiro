import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCsvRows, parseCsvBuffer, suggestCsvMapping } from "@/lib/csv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "..", "fixtures", "import-transactions.csv");

test("parseCsvBuffer parses fake fixture and yields valid rows", async () => {
  const fixtureBuffer = await fs.readFile(fixturePath);
  const parsed = parseCsvBuffer(fixtureBuffer);
  const mapping = suggestCsvMapping(parsed.columns);

  assert.equal(parsed.columns.includes("Date"), true);
  assert.equal(parsed.columns.includes("Description"), true);
  assert.equal(parsed.columns.includes("Amount"), true);
  assert.equal(mapping.date, "Date");
  assert.equal(mapping.amount, "Amount");
  assert.ok(mapping.description === "Description" || mapping.history === "Description");

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

  assert.ok(analysis.summary.totalRows >= 10);
  assert.ok(analysis.summary.validRows >= 10);
  assert.equal(analysis.summary.errorRows, 0);
});
