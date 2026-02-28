import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSeriesFromHistory,
  deriveAccountsSummary,
  resolveSummaryAtOrBeforeDate
} from "@/src/features/accounts/utils/accounts";

test("buildSeriesFromHistory carries last known balances across the selected interval", () => {
  const historicalSeries = [
    { date: "2026-02-02", assets: 100, debts: 20 },
    { date: "2026-02-05", assets: 150, debts: 30 }
  ];

  const series = buildSeriesFromHistory(
    historicalSeries,
    { assets: 50, debts: 10 },
    "1W",
    { start: new Date(2026, 1, 1), end: new Date(2026, 1, 6) }
  );

  assert.deepEqual(series, [
    { date: "2026-02-01", assets: 50, debts: 10 },
    { date: "2026-02-02", assets: 100, debts: 20 },
    { date: "2026-02-03", assets: 100, debts: 20 },
    { date: "2026-02-04", assets: 100, debts: 20 },
    { date: "2026-02-05", assets: 150, debts: 30 },
    { date: "2026-02-06", assets: 150, debts: 30 }
  ]);
});

test("buildSeriesFromHistory keeps stable fallback values when there is no historical data", () => {
  const series = buildSeriesFromHistory(
    [],
    { assets: 320, debts: 90 },
    "1W",
    { start: new Date(2026, 1, 1), end: new Date(2026, 1, 3) }
  );

  assert.deepEqual(series, [
    { date: "2026-02-01", assets: 320, debts: 90 },
    { date: "2026-02-02", assets: 320, debts: 90 },
    { date: "2026-02-03", assets: 320, debts: 90 }
  ]);
});

test("resolveSummaryAtOrBeforeDate uses the latest known point before the reference date", () => {
  const historicalSeries = [
    { date: "2026-02-03", assets: 100, debts: 20 },
    { date: "2026-02-07", assets: 200, debts: 40 }
  ];

  const resolved = resolveSummaryAtOrBeforeDate(
    historicalSeries,
    new Date(2026, 1, 6),
    { assets: 0, debts: 0 }
  );
  assert.deepEqual(resolved, { assets: 100, debts: 20 });

  const fallback = resolveSummaryAtOrBeforeDate(
    historicalSeries,
    new Date(2026, 1, 1),
    { assets: 50, debts: 10 }
  );
  assert.deepEqual(fallback, { assets: 50, debts: 10 });
});

test("deriveAccountsSummary always treats credit account balances as debt", () => {
  const summary = deriveAccountsSummary([
    {
      id: "acc-checking",
      name: "Conta corrente",
      type: "checking",
      currency: "BRL",
      currentBalance: 1000
    },
    {
      id: "acc-credit-negative",
      name: "Cartao A",
      type: "credit",
      currency: "BRL",
      currentBalance: -300
    },
    {
      id: "acc-credit-positive",
      name: "Cartao B",
      type: "credit",
      currency: "BRL",
      currentBalance: 80
    }
  ]);

  assert.deepEqual(summary, {
    assets: 1000,
    debts: 380
  });
});
