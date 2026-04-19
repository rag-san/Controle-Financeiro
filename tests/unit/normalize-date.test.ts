import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTransaction, parseFlexibleDate } from "@/lib/normalize";

test("parseFlexibleDate stores date-only financial dates at UTC noon", () => {
  assert.equal(parseFlexibleDate("2026-04-01").toISOString(), "2026-04-01T12:00:00.000Z");
  assert.equal(parseFlexibleDate("01/04/2026").toISOString(), "2026-04-01T12:00:00.000Z");
  assert.equal(parseFlexibleDate("01-04-2026").toISOString(), "2026-04-01T12:00:00.000Z");
  assert.equal(parseFlexibleDate("20260401").toISOString(), "2026-04-01T12:00:00.000Z");
});

test("parseFlexibleDate preserves explicit ISO datetimes", () => {
  assert.equal(
    parseFlexibleDate("2026-04-01T00:30:00.000Z").toISOString(),
    "2026-04-01T00:30:00.000Z"
  );
});

test("normalizeTransaction keeps imported date-only rows on their original calendar day", () => {
  const normalized = normalizeTransaction({
    date: "2026-04-01",
    description: "Compra no debito",
    amount: -10
  });

  assert.equal(normalized.date.toISOString(), "2026-04-01T12:00:00.000Z");
});
