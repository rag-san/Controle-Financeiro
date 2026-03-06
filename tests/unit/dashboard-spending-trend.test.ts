import test from "node:test";
import assert from "node:assert/strict";
import { buildSpendingTrendSeries } from "@/lib/server/dashboard-spending-trend";

function tx(input: { date: string; amount: number; type: string }) {
  return {
    date: new Date(input.date),
    amount: input.amount,
    type: input.type
  };
}

test("buildSpendingTrendSeries compares only until the same day in current month", () => {
  const result = buildSpendingTrendSeries({
    currentTransactions: [
      tx({ date: "2026-02-01T12:00:00.000Z", amount: -100, type: "expense" }),
      tx({ date: "2026-02-11T12:00:00.000Z", amount: -999, type: "expense" })
    ],
    previousTransactions: [
      tx({ date: "2026-01-01T12:00:00.000Z", amount: -50, type: "expense" }),
      tx({ date: "2026-01-10T12:00:00.000Z", amount: -25, type: "expense" }),
      tx({ date: "2026-01-18T12:00:00.000Z", amount: -99, type: "expense" })
    ],
    referenceDate: new Date("2026-02-10T12:00:00.000Z"),
    now: new Date("2026-02-10T12:00:00.000Z")
  });

  assert.equal(result.compareUntilDay, 10);
  assert.equal(result.daily.length, 10);
  assert.equal(result.accumulated.length, 10);
  assert.deepEqual(result.daily[0], { day: 1, current: 100, previous: 50 });
  assert.deepEqual(result.daily[9], { day: 10, current: 0, previous: 25 });
  assert.deepEqual(result.totals, { current: 100, previous: 75 });
});

test("buildSpendingTrendSeries limits by comparable month length for historical month", () => {
  const result = buildSpendingTrendSeries({
    currentTransactions: [
      tx({ date: "2026-03-28T12:00:00.000Z", amount: -30, type: "expense" }),
      tx({ date: "2026-03-30T12:00:00.000Z", amount: -20, type: "expense" })
    ],
    previousTransactions: [
      tx({ date: "2026-02-28T12:00:00.000Z", amount: -10, type: "expense" })
    ],
    referenceDate: new Date("2026-03-15T12:00:00.000Z"),
    now: new Date("2026-04-01T12:00:00.000Z")
  });

  assert.equal(result.compareUntilDay, 28);
  assert.equal(result.daily.length, 28);
  assert.equal(result.totals.current, 30);
  assert.equal(result.totals.previous, 10);
});

test("buildSpendingTrendSeries ignores non-expense types", () => {
  const result = buildSpendingTrendSeries({
    currentTransactions: [
      tx({ date: "2026-02-02T12:00:00.000Z", amount: 500, type: "income" }),
      tx({ date: "2026-02-03T12:00:00.000Z", amount: -70, type: "expense" }),
      tx({ date: "2026-02-04T12:00:00.000Z", amount: -50, type: "transfer" })
    ],
    previousTransactions: [
      tx({ date: "2026-01-03T12:00:00.000Z", amount: -30, type: "expense" }),
      tx({ date: "2026-01-04T12:00:00.000Z", amount: 15, type: "income" })
    ],
    referenceDate: new Date("2026-02-05T12:00:00.000Z"),
    now: new Date("2026-02-05T12:00:00.000Z")
  });

  assert.equal(result.compareUntilDay, 5);
  assert.equal(result.totals.current, 70);
  assert.equal(result.totals.previous, 30);
});
