import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { dashboardRepo } from "@/lib/server/dashboard.repo";
import { officialMetricSnapshotsRepo } from "@/lib/server/official-metric-snapshots.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";
import { buildCategoryMonthAggregates } from "@/src/features/categories/utils/categoryAggregates";
import {
  calculateTotals,
  formatRange,
  resolveCurrentRange,
  resolvePreviousRange,
  splitByRange,
  toComparisonMetric
} from "@/src/features/cashflow/utils/cashflow";
import { buildMonthlyExpensesStack } from "@/src/features/cashflow/utils/expensesStack";
import { buildMonthlyIncome } from "@/src/features/cashflow/utils/income";
import { buildMonthlyNetResult } from "@/src/features/cashflow/utils/netResult";
import type { CashflowPeriodKey } from "@/src/features/cashflow/types";
import { buildReportsModel } from "@/src/features/reports/buildReportsModel";
import type { ReportsPeriodPreset } from "@/src/features/reports/types";
import { buildPeriodComparison } from "@/src/features/reports/utils/period";

const querySchema = z.object({
  view: z.enum(["reports", "cashflow", "categories", "dashboard"]),
  preset: z.enum(["1M", "3M", "6M", "YTD", "1Y", "ALL"]).optional(),
  period: z.enum(["1m", "3m", "6m", "ytd", "12m"]).optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  accountId: z.string().min(6).max(128).optional(),
  categoryId: z.string().min(6).max(128).optional()
});

function parseMonthKey(monthKey: string): Date {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return new Date();
  }
  return new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
}

function serializePeriodRange(range: { preset: string; label: string; start: Date; end: Date }) {
  return {
    preset: range.preset,
    label: range.label,
    start: range.start.toISOString(),
    end: range.end.toISOString()
  };
}

function toTransactionDTO(
  item: Awaited<ReturnType<typeof transactionsRepo.listPaged>>[number]
) {
  return {
    id: item.id,
    accountId: item.accountId,
    categoryId: item.categoryId ?? null,
    importBatchId: item.importBatchId ?? null,
    date: item.date.toISOString(),
    description: item.description,
    amount: item.amount,
    type: item.type,
    status: item.status,
    transferGroupId: item.transferGroupId ?? null,
    transferPeerTxId: item.transferPeerTxId ?? null,
    account: {
      id: item.account.id,
      name: item.account.name,
      type: item.account.type,
      institution: item.account.institution ?? null,
      currency: item.account.currency,
      parentAccountId: item.account.parentAccountId ?? null
    },
    category: item.category
      ? {
          id: item.category.id,
          name: item.category.name,
          color: item.category.color,
          icon: item.category.icon ?? null,
          parentId: item.category.parentId ?? null
        }
      : null
  };
}

async function buildReportsViewPayload(input: {
  userId: string;
  preset: ReportsPeriodPreset;
  accountId?: string;
  categoryId?: string;
}) {
  const earliestDate = (await transactionsRepo.oldestPostedAt(input.userId)) ?? undefined;
  const period = buildPeriodComparison(input.preset, { now: new Date(), earliestDate });
  const start =
    period.current.start.getTime() <= period.previous.start.getTime() ? period.current.start : period.previous.start;
  const end = period.current.end.getTime() >= period.previous.end.getTime() ? period.current.end : period.previous.end;

  const rows = await transactionsRepo.listAll({
    userId: input.userId,
    dateFrom: start,
    dateTo: end
  });
  const transactions = rows.map(toTransactionDTO);
  const categories = await categoriesRepo.listByUser(input.userId);

  const model = buildReportsModel({
    transactions,
    categories,
    period,
    accountId: input.accountId,
    categoryId: input.categoryId
  });

  return {
    view: "reports" as const,
    period: {
      current: serializePeriodRange(period.current),
      previous: serializePeriodRange(period.previous)
    },
    accounts: await accountsRepo.listByUser(input.userId),
    categories,
    model: {
      ...model,
      recurringDetected: model.recurringDetected.map((item) => ({
        ...item,
        nextExpectedDate: item.nextExpectedDate ? item.nextExpectedDate.toISOString() : null
      })),
      timeSeries: model.timeSeries.map((item) => ({
        ...item,
        from: item.from.toISOString(),
        to: item.to.toISOString()
      }))
    }
  };
}

async function buildCashflowViewPayload(input: { userId: string; period: CashflowPeriodKey; accountId?: string }) {
  const referenceDate = (await transactionsRepo.latestPostedAt(input.userId)) ?? new Date();
  const currentRange = resolveCurrentRange(input.period, referenceDate);
  const previousRange = resolvePreviousRange(currentRange);
  const mergedRange = {
    from: previousRange.from,
    to: currentRange.to
  };

  const rangeTransactions = (await transactionsRepo
    .listAll({
      userId: input.userId,
      dateFrom: mergedRange.from,
      dateTo: mergedRange.to,
      accountId: input.accountId
    }))
    .map(toTransactionDTO);
  const currentTransactions = splitByRange(rangeTransactions, currentRange);
  const previousTransactions = splitByRange(rangeTransactions, previousRange);

  const currentTotals = calculateTotals(currentTransactions);
  const previousTotals = calculateTotals(previousTransactions);

  return {
    view: "cashflow" as const,
    data: {
      currentRangeLabel: formatRange(currentRange),
      previousRangeLabel: formatRange(previousRange),
      netResult: toComparisonMetric(currentTotals.net, previousTotals.net),
      income: toComparisonMetric(currentTotals.income, previousTotals.income),
      expense: toComparisonMetric(currentTotals.expense, previousTotals.expense),
      netChart: buildMonthlyNetResult(currentTransactions, {
        start: currentRange.from,
        end: currentRange.to,
        previousTransactions,
        previousStart: previousRange.from,
        previousEnd: previousRange.to
      }),
      incomeChart: buildMonthlyIncome(currentTransactions, {
        start: currentRange.from,
        end: currentRange.to
      }),
      expensesChart: buildMonthlyExpensesStack(currentTransactions, { topN: 8 })
    }
  };
}

async function buildCategoriesViewPayload(input: { userId: string; month: string; accountId?: string }) {
  const referenceDate = parseMonthKey(input.month);
  const monthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const categories = await categoriesRepo.listByUser(input.userId);
  const transactions = (await transactionsRepo
    .listAll({
      userId: input.userId,
      dateFrom: monthStart,
      dateTo: monthEnd,
      accountId: input.accountId
    }))
    .map(toTransactionDTO);
  const aggregates = buildCategoryMonthAggregates(categories, transactions, referenceDate);

  return {
    view: "categories" as const,
    month: format(referenceDate, "yyyy-MM"),
    aggregates: {
      ...aggregates,
      monthInterval: {
        start: aggregates.monthInterval.start.toISOString(),
        end: aggregates.monthInterval.end.toISOString()
      }
    }
  };
}

function isHistoricalMonth(monthKey: string): boolean {
  return monthKey < format(new Date(), "yyyy-MM");
}

async function buildDashboardViewPayloadWithSnapshots(input: { userId: string; month?: string }) {
  const requestedMonth = input.month?.trim() || null;
  if (requestedMonth && isHistoricalMonth(requestedMonth)) {
    const snapshot = await officialMetricSnapshotsRepo.find({
      userId: input.userId,
      metricKey: "dashboard",
      periodKey: requestedMonth
    });

    if (snapshot && snapshot.payload && typeof snapshot.payload === "object") {
      return snapshot.payload as { view: "dashboard" } & Awaited<ReturnType<typeof dashboardRepo.fullDashboard>>;
    }
  }

  const referenceDate = requestedMonth ? parseMonthKey(requestedMonth) : new Date();
  const payload = {
    view: "dashboard" as const,
    ...(await dashboardRepo.fullDashboard(input.userId, referenceDate, {
      forceReferenceDate: Boolean(requestedMonth)
    }))
  };

  await officialMetricSnapshotsRepo.upsert({
    userId: input.userId,
    metricKey: "dashboard",
    periodKey: payload.referenceMonth,
    payload
  });

  return payload;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/metrics/official.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.view === "reports" && !parsed.data.preset) {
      return NextResponse.json({ error: "Preset e obrigatorio para view=reports." }, { status: 400 });
    }
    if (parsed.data.view === "cashflow" && !parsed.data.period) {
      return NextResponse.json({ error: "Periodo e obrigatorio para view=cashflow." }, { status: 400 });
    }
    if (parsed.data.view === "categories" && !parsed.data.month) {
      return NextResponse.json({ error: "Mes e obrigatorio para view=categories." }, { status: 400 });
    }

    const cacheQuery = request.nextUrl.searchParams.toString();
    const cacheKey = `official-metrics:${auth.userId}:${cacheQuery || "default"}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: privateCacheHeaders });
    }

    const payload =
      parsed.data.view === "reports"
        ? await buildReportsViewPayload({
            userId: auth.userId,
            preset: parsed.data.preset as ReportsPeriodPreset,
            accountId: parsed.data.accountId,
            categoryId: parsed.data.categoryId
          })
        : parsed.data.view === "cashflow"
          ? await buildCashflowViewPayload({
              userId: auth.userId,
              period: parsed.data.period as CashflowPeriodKey,
              accountId: parsed.data.accountId
            })
          : parsed.data.view === "categories"
            ? await buildCategoriesViewPayload({
                userId: auth.userId,
                month: parsed.data.month as string,
                accountId: parsed.data.accountId
              })
            : await buildDashboardViewPayloadWithSnapshots({
                userId: auth.userId,
                month: parsed.data.month
              });

    setCache(cacheKey, payload, 10_000);

    return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}
