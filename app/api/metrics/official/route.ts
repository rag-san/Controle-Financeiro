import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import {
  toUtcMonthKey,
  utcEndOfMonth,
  utcMonthReference,
  utcStartOfMonth
} from "@/lib/finance/utc-date";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { LedgerCoverageError } from "@/lib/server/analytics-source";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { DASHBOARD_CALCULATION_VERSION, dashboardRepo } from "@/lib/server/dashboard.repo";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";
import { officialMetricSnapshotsRepo } from "@/lib/server/official-metric-snapshots.repo";
import {
  getOfficialCashflowData,
  getOfficialReportsData
} from "@/lib/server/official-analytics.service";
import { buildCategoryMonthAggregates } from "@/src/features/categories/utils/categoryAggregates";
import type { CashflowPeriodKey } from "@/src/features/cashflow/types";
import type { ReportsPeriodPreset } from "@/src/features/reports/types";
import type { TransactionDTO } from "@/lib/types";

type DashboardViewPayload = { view: "dashboard" } & Awaited<ReturnType<typeof dashboardRepo.fullDashboard>>;

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

function resolveAccountType(
  type: "checking" | "credit" | "cash" | "investment" | null | undefined
): TransactionDTO["account"]["type"] {
  if (type === "checking" || type === "credit" || type === "cash" || type === "investment") {
    return type;
  }
  return "checking";
}

function toCategoryExpenseTransactionDTO(
  entry: Awaited<ReturnType<typeof loadNormalizedTransactionsForScope>>["entries"][number],
  categoriesById: Map<string, Awaited<ReturnType<typeof categoriesRepo.listByUser>>[number]>
): TransactionDTO | null {
  if (entry.excluded || entry.isBalanceAdjustment || entry.budgetImpact !== "counts_as_expense") {
    return null;
  }

  const accountId = entry.accountId?.trim();
  if (!accountId) {
    return null;
  }

  const category = entry.categoryId ? categoriesById.get(entry.categoryId) ?? null : null;
  const amount = Number(entry.budgetSignedAmount.toFixed(2));
  const direction: TransactionDTO["direction"] = amount >= 0 ? "in" : "out";

  return {
    id: entry.id,
    accountId,
    categoryId: entry.categoryId ?? null,
    importBatchId: entry.importBatchId ?? null,
    date: entry.date,
    description: entry.descriptionOriginal,
    amount,
    type: "expense",
    direction,
    excluded: entry.excluded,
    isInternalTransfer: entry.isInternalTransfer,
    status: "posted",
    transferGroupId: null,
    transferPeerTxId: null,
    transferFromAccountId: null,
    transferToAccountId: null,
    raw: null,
    account: {
      id: accountId,
      name: entry.accountName?.trim() || "Conta",
      type: resolveAccountType(entry.accountType),
      institution: null,
      currency: "BRL",
      parentAccountId: null
    },
    category: category
      ? {
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon ?? null,
          parentId: category.parentId ?? null
        }
      : null
  };
}

async function buildReportsViewPayload(input: {
  userId: string;
  preset: "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
  accountId?: string;
  categoryId?: string;
}) {
  const payload = await getOfficialReportsData(input);

  return {
    view: "reports" as const,
    period: {
      current: serializePeriodRange(payload.period.current),
      previous: serializePeriodRange(payload.period.previous)
    },
    accounts: payload.accounts,
    categories: payload.categories,
    model: {
      ...payload.model,
      recurringDetected: payload.model.recurringDetected.map((item) => ({
        ...item,
        nextExpectedDate: item.nextExpectedDate ? item.nextExpectedDate.toISOString() : null
      })),
      timeSeries: payload.model.timeSeries.map((item) => ({
        ...item,
        from: item.from.toISOString(),
        to: item.to.toISOString()
      }))
    }
  };
}

async function buildCashflowViewPayload(input: {
  userId: string;
  period: "1m" | "3m" | "6m" | "ytd" | "12m";
  accountId?: string;
}) {
  return {
    view: "cashflow" as const,
    data: await getOfficialCashflowData(input)
  };
}

async function buildCategoriesViewPayload(input: { userId: string; month: string; accountId?: string }) {
  const referenceDate = parseMonthKey(input.month);
  const monthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const [categories, normalizedScope] = await Promise.all([
    categoriesRepo.listByUser(input.userId),
    loadNormalizedTransactionsForScope({
      userId: input.userId,
      from: monthStart,
      to: monthEnd,
      accountId: input.accountId,
      transactionType: "expense",
      excluded: false,
      hideCardPaymentMirrorInflow: true
    })
  ]);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const transactions = normalizedScope.entries
    .map((entry) => toCategoryExpenseTransactionDTO(entry, categoriesById))
    .filter((item): item is TransactionDTO => item !== null);
  const aggregates = buildCategoryMonthAggregates(categories, transactions, referenceDate);

  return {
    view: "categories" as const,
    month: toUtcMonthKey(referenceDate),
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
  return monthKey < toUtcMonthKey(new Date());
}

function buildDashboardReferenceMeta(referenceMonth: string) {
  const referenceDate = parseMonthKey(referenceMonth);
  const previousReferenceDate = utcMonthReference(referenceDate, -1);

  return {
    previousReferenceMonth: toUtcMonthKey(previousReferenceDate),
    referencePeriod: {
      start: utcStartOfMonth(referenceDate).toISOString(),
      end: utcEndOfMonth(referenceDate).toISOString()
    },
    comparisonPeriod: {
      start: utcStartOfMonth(previousReferenceDate).toISOString(),
      end: utcEndOfMonth(previousReferenceDate).toISOString()
    }
  };
}

function asDashboardViewPayload(value: unknown): DashboardViewPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DashboardViewPayload>;

  if (candidate.view !== "dashboard") return null;
  if (typeof candidate.referenceMonth !== "string") return null;
  if (typeof candidate.isCurrentMonthReference !== "boolean") return null;
  if (!candidate.cards || typeof candidate.cards !== "object") return null;
  if (!Array.isArray(candidate.spendingTrend)) return null;
  if (!Array.isArray(candidate.topCategories)) return null;

  return candidate as DashboardViewPayload;
}

function normalizeDashboardViewPayload(
  payload: DashboardViewPayload,
  input: { requestedMonth: string | null; now: Date }
): DashboardViewPayload {
  const referenceMonth = input.requestedMonth || payload.referenceMonth;
  const isCurrentMonthReference = referenceMonth === toUtcMonthKey(input.now);
  const expectedMeta = buildDashboardReferenceMeta(referenceMonth);
  const hasMatchingReferencePeriod =
    typeof payload.referencePeriod?.start === "string" &&
    typeof payload.referencePeriod?.end === "string" &&
    payload.referencePeriod.start === expectedMeta.referencePeriod.start &&
    payload.referencePeriod.end === expectedMeta.referencePeriod.end;
  const hasMatchingComparisonPeriod =
    typeof payload.comparisonPeriod?.start === "string" &&
    typeof payload.comparisonPeriod?.end === "string" &&
    payload.comparisonPeriod.start === expectedMeta.comparisonPeriod.start &&
    payload.comparisonPeriod.end === expectedMeta.comparisonPeriod.end;

  if (
    payload.referenceMonth === referenceMonth &&
    payload.isCurrentMonthReference === isCurrentMonthReference &&
    payload.previousReferenceMonth === expectedMeta.previousReferenceMonth &&
    hasMatchingReferencePeriod &&
    hasMatchingComparisonPeriod
  ) {
    return payload;
  }

  return {
    ...payload,
    referenceMonth,
    isCurrentMonthReference,
    ...expectedMeta
  };
}

async function buildDashboardViewPayloadWithSnapshots(input: { userId: string; month?: string }) {
  const now = new Date();
  const requestedMonth = input.month?.trim() || null;
  if (requestedMonth && isHistoricalMonth(requestedMonth)) {
    const snapshot = await officialMetricSnapshotsRepo.find({
      userId: input.userId,
      metricKey: "dashboard",
      periodKey: requestedMonth
    });

    const snapshotPayload = asDashboardViewPayload(snapshot?.payload);
    const hasFinanceBreakdown =
      snapshotPayload !== null &&
      snapshotPayload.financeBreakdown !== undefined &&
      Array.isArray(snapshotPayload.financeBreakdown.cards);
    const hasCurrentDashboardCalculation =
      snapshotPayload?.dashboardCalculationVersion === DASHBOARD_CALCULATION_VERSION;

    const latestSourceMutationAt = snapshot
      ? await officialMetricSnapshotsRepo.latestSourceMutationAt(input.userId)
      : null;
    const snapshotIsFresh =
      !latestSourceMutationAt ||
      (snapshot?.updatedAtDate instanceof Date &&
        snapshot.updatedAtDate.getTime() >= latestSourceMutationAt.getTime());

    if (snapshot && snapshotPayload && hasFinanceBreakdown && hasCurrentDashboardCalculation && snapshotIsFresh) {
      const normalizedSnapshot = normalizeDashboardViewPayload(snapshotPayload, { requestedMonth, now });
      if (normalizedSnapshot !== snapshotPayload) {
        await officialMetricSnapshotsRepo.upsert({
          userId: input.userId,
          metricKey: "dashboard",
          periodKey: requestedMonth,
          payload: normalizedSnapshot
        });
      }
      return normalizedSnapshot;
    }
  }

  const referenceDate = requestedMonth ? parseMonthKey(requestedMonth) : now;
  const payload: DashboardViewPayload = {
    view: "dashboard" as const,
    ...(await dashboardRepo.fullDashboard(input.userId, now, {
      forceReferenceDate: true,
      referenceDate
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
      return NextResponse.json({ error: "Preset é obrigatório para view=reports." }, { status: 400 });
    }
    if (parsed.data.view === "cashflow" && !parsed.data.period) {
      return NextResponse.json({ error: "Período é obrigatório para view=cashflow." }, { status: 400 });
    }
    if (parsed.data.view === "categories" && !parsed.data.month) {
      return NextResponse.json({ error: "Mês é obrigatório para view=categories." }, { status: 400 });
    }

    const cacheQuery = request.nextUrl.searchParams.toString();
    const cacheKey = `official-metrics:${auth.userId}:${cacheQuery || "default"}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: privateCacheHeaders });
    }

    let payload;
    try {
      payload =
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
    } catch (error) {
      if (error instanceof LedgerCoverageError) {
        return NextResponse.json(
          {
            code: "ledger_coverage_incomplete",
            message:
              "A cobertura do ledger está incompleta para esta consulta. Corrija a sincronização antes de recalcular métricas.",
            details: {
              reason: error.resolution.reason,
              legacyTransactionCount: error.resolution.legacyTransactionCount,
              unmirroredLegacyTransactionCount: error.resolution.unmirroredLegacyTransactionCount,
              ledgerEntryCount: error.resolution.ledgerEntryCount
            }
          },
          { status: 409 }
        );
      }
      throw error;
    }

    setCache(cacheKey, payload, 10_000);

    return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}
