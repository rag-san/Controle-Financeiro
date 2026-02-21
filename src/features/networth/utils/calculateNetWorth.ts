import type { AccountDTO } from "@/lib/types";
import type { NetWorthPoint, NetWorthSnapshot } from "@/src/features/networth/types";

function toSafeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function deriveSnapshotFromAccounts(accounts: AccountDTO[]): NetWorthSnapshot {
  const summary = accounts.reduce(
    (accumulator, account) => {
      const balance = account.currentBalance ?? 0;

      if (balance >= 0) {
        accumulator.assets += balance;
      } else {
        accumulator.debts += Math.abs(balance);
      }

      return accumulator;
    },
    { assets: 0, debts: 0 }
  );

  return {
    assets: toSafeNumber(summary.assets),
    debts: toSafeNumber(summary.debts),
    net: toSafeNumber(summary.assets - summary.debts)
  };
}

export function getLatestSnapshot(points: NetWorthPoint[], fallback: NetWorthSnapshot): NetWorthSnapshot {
  const latest = points[points.length - 1];
  if (!latest) return fallback;

  return {
    assets: toSafeNumber(latest.assets),
    debts: toSafeNumber(latest.debts),
    net: toSafeNumber(latest.net)
  };
}

export function calculateDeltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}
