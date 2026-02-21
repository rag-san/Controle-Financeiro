import {
  addMilliseconds,
  differenceInMilliseconds,
  endOfDay,
  startOfDay
} from "date-fns";
import type { DateInterval, NetWorthChartPoint, NetWorthPoint } from "@/src/features/networth/types";

export function resolvePreviousInterval(interval: DateInterval): DateInterval {
  const rangeSpanMs = differenceInMilliseconds(interval.end, interval.start);
  const previousEnd = endOfDay(addMilliseconds(interval.start, -1));
  const previousStart = startOfDay(addMilliseconds(previousEnd, -rangeSpanMs));
  return { start: previousStart, end: previousEnd };
}

function resolvePreviousIndex(currentIndex: number, currentLength: number, previousLength: number): number {
  if (previousLength <= 1 || currentLength <= 1) {
    return 0;
  }

  const progress = currentIndex / (currentLength - 1);
  return Math.round(progress * (previousLength - 1));
}

export function buildPreviousPeriodComparison(
  currentSeries: NetWorthPoint[],
  previousSeries: NetWorthPoint[]
): NetWorthChartPoint[] {
  if (currentSeries.length === 0) {
    return [];
  }

  if (previousSeries.length === 0) {
    return currentSeries.map((point) => ({
      ...point,
      previousNet: null
    }));
  }

  return currentSeries.map((point, index) => {
    const previousIndex = resolvePreviousIndex(index, currentSeries.length, previousSeries.length);
    const previousNet = previousSeries[previousIndex]?.net;

    return {
      ...point,
      previousNet: Number.isFinite(previousNet) ? Number(previousNet.toFixed(2)) : null
    };
  });
}
