import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  format,
  isWithinInterval,
  startOfDay,
  startOfYear,
  subDays,
  subMonths,
  subYears
} from "date-fns";
import type {
  DateInterval,
  NetWorthEntryDTO,
  NetWorthPoint,
  NetWorthRangeKey,
  NetWorthSnapshot
} from "@/src/features/networth/types";

function toSafeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function normalizeDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return format(value, "yyyy-MM-dd");
  }

  return value.slice(0, 10);
}

export function buildHistorySeries(entries: NetWorthEntryDTO[]): NetWorthPoint[] {
  const groupedByDate = new Map<string, { assets: number; debts: number }>();

  for (const entry of entries) {
    const dateKey = normalizeDateKey(entry.date);
    const current = groupedByDate.get(dateKey) ?? { assets: 0, debts: 0 };

    if (entry.type === "asset") {
      current.assets += Math.max(0, entry.value);
    } else {
      current.debts += Math.abs(entry.value);
    }

    groupedByDate.set(dateKey, current);
  }

  return [...groupedByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => {
      const assets = toSafeNumber(values.assets);
      const debts = toSafeNumber(values.debts);
      return {
        date,
        assets,
        debts,
        net: toSafeNumber(assets - debts)
      };
    });
}

export function resolveRangeInterval(
  range: NetWorthRangeKey,
  referenceDate: Date,
  earliestDate?: Date
): DateInterval {
  const end = endOfDay(referenceDate);

  if (range === "ALL") {
    return {
      start: earliestDate ? startOfDay(earliestDate) : startOfDay(subYears(end, 2)),
      end
    };
  }

  if (range === "1D") {
    return {
      start: startOfDay(subDays(end, 1)),
      end
    };
  }

  if (range === "1W") {
    return {
      start: startOfDay(subDays(end, 6)),
      end
    };
  }

  if (range === "1M") {
    return {
      start: startOfDay(subMonths(end, 1)),
      end
    };
  }

  if (range === "3M") {
    return {
      start: startOfDay(subMonths(end, 3)),
      end
    };
  }

  if (range === "YTD") {
    return {
      start: startOfYear(end),
      end
    };
  }

  return {
    start: startOfDay(subYears(end, 1)),
    end
  };
}

function ensureEndDate(dates: Date[], endDate: Date): Date[] {
  const endKey = normalizeDateKey(endDate);
  const hasEndDate = dates.some((date) => normalizeDateKey(date) === endKey);
  if (hasEndDate) return dates;
  return [...dates, endDate];
}

function buildDerivedDates(range: NetWorthRangeKey, interval: DateInterval): Date[] {
  if (range === "1D" || range === "1W" || range === "1M") {
    return eachDayOfInterval({ start: interval.start, end: interval.end });
  }

  if (range === "3M" || range === "YTD") {
    return ensureEndDate(eachWeekOfInterval({ start: interval.start, end: interval.end }), interval.end);
  }

  return ensureEndDate(eachMonthOfInterval({ start: interval.start, end: interval.end }), interval.end);
}

export function buildDerivedSeriesFromSnapshot(
  snapshot: NetWorthSnapshot,
  range: NetWorthRangeKey,
  interval: DateInterval
): NetWorthPoint[] {
  const dates = buildDerivedDates(range, interval);
  const normalizedDates = dates.length > 0 ? dates : [interval.end];

  // TODO: Replace flat fallback with real historical net worth snapshots once timeline API is available.
  return normalizedDates.map((date) => ({
    date: normalizeDateKey(date),
    assets: toSafeNumber(snapshot.assets),
    debts: toSafeNumber(snapshot.debts),
    net: toSafeNumber(snapshot.net)
  }));
}

export function filterHistoryByInterval(
  timeline: NetWorthPoint[],
  interval: DateInterval
): NetWorthPoint[] {
  return timeline.filter((point) => {
    const pointDate = startOfDay(new Date(`${point.date}T12:00:00`));
    return isWithinInterval(pointDate, { start: interval.start, end: interval.end });
  });
}
