import {
  endOfDay,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears
} from "date-fns";
import type { ReportsPeriodComparison, ReportsPeriodPreset, ReportsPeriodRange } from "@/src/features/reports/types";

function resolveCurrentRange(
  preset: ReportsPeriodPreset,
  now: Date,
  earliestDate?: Date
): ReportsPeriodRange {
  const end = endOfDay(now);

  if (preset === "YTD") {
    return {
      preset,
      label: "Ano atual",
      start: startOfYear(now),
      end
    };
  }

  if (preset === "ALL") {
    const fallbackStart = subYears(now, 10);
    return {
      preset,
      label: "Todo período",
      start: startOfDay(earliestDate ?? fallbackStart),
      end
    };
  }

  const months = preset === "1M" ? 1 : preset === "3M" ? 3 : preset === "6M" ? 6 : 12;
  const start = startOfMonth(subMonths(now, months - 1));

  return {
    preset,
    label: `Últimos ${months} meses`,
    start,
    end
  };
}

export function buildPeriodComparison(
  preset: ReportsPeriodPreset,
  options?: { now?: Date; earliestDate?: Date }
): ReportsPeriodComparison {
  const now = options?.now ?? new Date();
  const current = resolveCurrentRange(preset, now, options?.earliestDate);

  const currentDurationMs = Math.max(1, current.end.getTime() - current.start.getTime());
  const previousEnd = new Date(current.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - currentDurationMs);

  return {
    current,
    previous: {
      preset,
      label: "Período anterior",
      start: previousStart,
      end: previousEnd
    }
  };
}
