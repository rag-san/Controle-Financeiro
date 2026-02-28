import { z } from "zod";
import { normalizeDescription } from "@/lib/normalize";
import {
  type DashboardDateRange,
  type DashboardGranularity,
  type DashboardMetricsFilters,
  resolveDashboardDateRange
} from "@/lib/server/dashboard-metrics.repo";

const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParamSchema = z.string().min(6).max(128);

const sharedFiltersQuerySchema = z.object({
  type: z.enum(["income", "expense", "transfer"]).optional(),
  accountId: idParamSchema.optional(),
  categoryId: idParamSchema.optional(),
  excluded: z.enum(["true", "false"]).optional(),
  q: z.string().max(180).optional()
});

const baseRangeQuerySchema = sharedFiltersQuerySchema.extend({
  from: dateParamSchema.optional(),
  to: dateParamSchema.optional()
});

const trendsQuerySchema = baseRangeQuerySchema.extend({
  granularity: z.enum(["day", "week", "month"]).optional().default("day")
});

function parseDateParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeRawQuery(raw: Record<string, string | undefined>): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) {
      normalized[key] = undefined;
      continue;
    }
    const trimmed = value.trim();
    normalized[key] = trimmed.length > 0 ? trimmed : undefined;
  }
  return normalized;
}

function buildDashboardFilters(
  parsed: z.infer<typeof sharedFiltersQuerySchema>
): DashboardMetricsFilters {
  const normalizedQuery = parsed.q ? normalizeDescription(parsed.q) : "";

  return {
    type: parsed.type,
    accountId: parsed.accountId,
    categoryId: parsed.categoryId,
    excluded: parsed.excluded === undefined ? undefined : parsed.excluded === "true",
    normalizedQuery: normalizedQuery.length > 0 ? normalizedQuery : undefined
  };
}

export function parseDashboardRangeWithFilters(raw: Record<string, string | undefined>): {
  range: DashboardDateRange;
  filters: DashboardMetricsFilters;
} {
  const parsed = baseRangeQuerySchema.parse(normalizeRawQuery(raw));
  const fromDate = parsed.from ? parseDateParam(parsed.from) : undefined;
  const toDate = parsed.to ? parseDateParam(parsed.to) : undefined;
  return {
    range: resolveDashboardDateRange({ from: fromDate, to: toDate }),
    filters: buildDashboardFilters(parsed)
  };
}

export function parseDashboardTrendsQuery(raw: Record<string, string | undefined>): {
  range: DashboardDateRange;
  granularity: DashboardGranularity;
  filters: DashboardMetricsFilters;
} {
  const parsed = trendsQuerySchema.parse(normalizeRawQuery(raw));
  const fromDate = parsed.from ? parseDateParam(parsed.from) : undefined;
  const toDate = parsed.to ? parseDateParam(parsed.to) : undefined;

  return {
    range: resolveDashboardDateRange({ from: fromDate, to: toDate }),
    granularity: parsed.granularity,
    filters: buildDashboardFilters(parsed)
  };
}
