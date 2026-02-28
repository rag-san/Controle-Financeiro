import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths
} from "date-fns";
import type { PeriodComparison, PeriodRange } from "@/src/features/insights/types";

type TransactionPeriodKey = "7d" | "30d" | "90d" | "this-month" | "last-month" | "custom" | "all";

type BuildPeriodParams = {
  referenceDate?: Date;
  range?: TransactionPeriodKey;
  from?: string;
  to?: string;
};

function formatDateInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function parseInputDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function createPeriodRange(args: {
  key: string;
  label: string;
  start: Date;
  end: Date;
  query: string;
}): PeriodRange {
  return {
    key: args.key,
    label: args.label,
    start: startOfDay(args.start),
    end: endOfDay(args.end),
    query: args.query
  };
}

function resolveCurrentPeriod(params: BuildPeriodParams): PeriodRange {
  const referenceDate = params.referenceDate ?? new Date();
  const range = params.range ?? "this-month";

  if (range === "custom") {
    const parsedFrom = parseInputDate(params.from);
    const parsedTo = parseInputDate(params.to);
    if (parsedFrom && parsedTo) {
      return createPeriodRange({
        key: "custom",
        label: "Período personalizado",
        start: parsedFrom,
        end: parsedTo,
        query: `period=custom&from=${encodeURIComponent(formatDateInput(parsedFrom))}&to=${encodeURIComponent(formatDateInput(parsedTo))}`
      });
    }
  }

  if (range === "all") {
    const end = referenceDate;
    const start = startOfYear(referenceDate);
    return createPeriodRange({
      key: "all",
      label: "Todo período",
      start,
      end,
      query: "period=all"
    });
  }

  if (range === "7d") {
    return createPeriodRange({
      key: "7d",
      label: "Últimos 7 dias",
      start: subDays(referenceDate, 6),
      end: referenceDate,
      query: "period=custom"
    });
  }

  if (range === "30d") {
    return createPeriodRange({
      key: "30d",
      label: "Últimos 30 dias",
      start: subDays(referenceDate, 29),
      end: referenceDate,
      query: "period=30d"
    });
  }

  if (range === "90d") {
    return createPeriodRange({
      key: "90d",
      label: "Últimos 90 dias",
      start: subDays(referenceDate, 89),
      end: referenceDate,
      query: "period=custom"
    });
  }

  if (range === "last-month") {
    const previousMonth = subMonths(referenceDate, 1);
    return createPeriodRange({
      key: "last-month",
      label: "Mês passado",
      start: startOfMonth(previousMonth),
      end: endOfMonth(previousMonth),
      query: "period=last-month"
    });
  }

  return createPeriodRange({
    key: "this-month",
    label: "Este mês",
    start: startOfMonth(referenceDate),
    end: endOfMonth(referenceDate),
    query: "period=this-month"
  });
}

function resolvePreviousPeriod(current: PeriodRange): PeriodRange {
  const spanDays = Math.max(1, differenceInCalendarDays(current.end, current.start) + 1);
  const previousEnd = subDays(current.start, 1);
  const previousStart = subDays(previousEnd, spanDays - 1);

  return createPeriodRange({
    key: `previous-${current.key}`,
    label: "Período anterior",
    start: previousStart,
    end: previousEnd,
    query: `period=custom&from=${encodeURIComponent(formatDateInput(previousStart))}&to=${encodeURIComponent(formatDateInput(previousEnd))}`
  });
}

export function buildPeriodComparison(params: BuildPeriodParams): PeriodComparison {
  const current = resolveCurrentPeriod(params);
  const previous = resolvePreviousPeriod(current);
  return {
    currentPeriod: current,
    previousPeriod: previous
  };
}
