import {
  addMilliseconds,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  differenceInMilliseconds,
  endOfDay,
  isWithinInterval,
  startOfDay,
  startOfYear,
  subDays,
  subMonths,
  subYears
} from "date-fns";
import type { AccountDTO } from "@/lib/types";
import { normalizeDateKey } from "@/src/features/shared/utils/dateKey";
import type {
  AccountsRangeKey,
  AccountsSummary,
  AssetsDebtsPoint,
  ConnectionGroup,
  NetWorthEntryDTO
} from "@/src/features/accounts/types";

export type DateInterval = {
  start: Date;
  end: Date;
};
export { normalizeDateKey };

export function deriveAccountsSummary(accounts: AccountDTO[]): AccountsSummary {
  return accounts.reduce(
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
}

export function splitAccountGroups(accounts: AccountDTO[]): {
  creditCards: AccountDTO[];
  bankAccounts: AccountDTO[];
} {
  const creditCards: AccountDTO[] = [];
  const bankAccounts: AccountDTO[] = [];

  for (const account of accounts) {
    if (account.type === "credit") {
      creditCards.push(account);
      continue;
    }
    bankAccounts.push(account);
  }

  return { creditCards, bankAccounts };
}

export function buildConnections(accounts: AccountDTO[]): ConnectionGroup[] {
  const map = new Map<string, AccountDTO[]>();

  for (const account of accounts) {
    const institution = account.institution?.trim();
    if (!institution) continue;

    const list = map.get(institution) ?? [];
    list.push(account);
    map.set(institution, list);
  }

  return [...map.entries()]
    .map(([institution, groupedAccounts]) => ({
      institution,
      accountCount: groupedAccounts.length,
      accounts: groupedAccounts
    }))
    .sort((left, right) => left.institution.localeCompare(right.institution));
}

export function resolveRangeInterval(referenceDate: Date, range: AccountsRangeKey): DateInterval {
  const end = endOfDay(referenceDate);

  switch (range) {
    case "1W":
      return { start: startOfDay(subDays(end, 6)), end };
    case "1M":
      return { start: startOfDay(subMonths(end, 1)), end };
    case "YTD":
      return { start: startOfYear(end), end };
    case "3M":
      return { start: startOfDay(subMonths(end, 3)), end };
    case "1Y":
      return { start: startOfDay(subYears(end, 1)), end };
    case "ALL":
    default:
      return { start: startOfDay(subYears(end, 2)), end };
  }
}

export function resolvePreviousInterval(interval: DateInterval): DateInterval {
  const spanMs = differenceInMilliseconds(interval.end, interval.start);
  const previousEnd = endOfDay(addMilliseconds(interval.start, -1));
  const previousStart = startOfDay(addMilliseconds(previousEnd, -spanMs));
  return { start: previousStart, end: previousEnd };
}

export function buildHistoricalAssetsDebtsSeries(entries: NetWorthEntryDTO[]): AssetsDebtsPoint[] {
  const byDate = new Map<string, { assets: number; debts: number }>();

  for (const entry of entries) {
    const dateKey = normalizeDateKey(entry.date);
    const current = byDate.get(dateKey) ?? { assets: 0, debts: 0 };

    if (entry.type === "asset") {
      current.assets += entry.value;
    } else {
      current.debts += Math.abs(entry.value);
    }

    byDate.set(dateKey, current);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      assets: Number(values.assets.toFixed(2)),
      debts: Number(values.debts.toFixed(2))
    }));
}

export function filterSeriesByInterval(
  series: AssetsDebtsPoint[],
  interval: DateInterval
): AssetsDebtsPoint[] {
  return series.filter((point) => {
    const pointDate = startOfDay(new Date(point.date));
    return isWithinInterval(pointDate, { start: interval.start, end: interval.end });
  });
}

function ensureEndDate(dates: Date[], endDate: Date): Date[] {
  const endKey = normalizeDateKey(endDate);
  const hasEnd = dates.some((date) => normalizeDateKey(date) === endKey);
  if (hasEnd) {
    return dates;
  }

  return [...dates, endDate];
}

function clipToInterval(dates: Date[], interval: DateInterval): Date[] {
  return dates.filter((date) => date >= interval.start && date <= interval.end);
}

function buildPlaceholderDates(range: AccountsRangeKey, interval: DateInterval): Date[] {
  if (range === "1W" || range === "1M") {
    return clipToInterval(eachDayOfInterval({ start: interval.start, end: interval.end }), interval);
  }

  if (range === "3M" || range === "YTD") {
    return ensureEndDate(
      clipToInterval(eachWeekOfInterval({ start: interval.start, end: interval.end }), interval),
      interval.end
    );
  }

  return ensureEndDate(
    clipToInterval(eachMonthOfInterval({ start: interval.start, end: interval.end }), interval),
    interval.end
  );
}

export function buildPlaceholderSeries(
  summary: AccountsSummary,
  range: AccountsRangeKey,
  interval: DateInterval
): AssetsDebtsPoint[] {
  const timeline = buildPlaceholderDates(range, interval);
  const normalizedTimeline = timeline.length > 0 ? timeline : [interval.end];

  return normalizedTimeline.map((date) => ({
    // TODO: Replace placeholder flat series with real historical account balances when available.
    date: normalizeDateKey(date),
    assets: Number(summary.assets.toFixed(2)),
    debts: Number(summary.debts.toFixed(2))
  }));
}

export function resolveComparisonFromSeries(
  series: AssetsDebtsPoint[],
  fallback: AccountsSummary
): AccountsSummary {
  const latest = series[series.length - 1];
  if (!latest) return fallback;
  return {
    assets: latest.assets,
    debts: latest.debts
  };
}

export function calculateDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}
