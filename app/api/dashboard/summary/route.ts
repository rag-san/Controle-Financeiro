import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { dashboardMetricsRepo } from "@/lib/server/dashboard-metrics.repo";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { parseDashboardRangeWithFilters } from "@/app/api/dashboard/_query";

function safeVariationPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/dashboard/summary.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const rawQuery = Object.fromEntries(request.nextUrl.searchParams.entries());
    const cacheQuery = request.nextUrl.searchParams.toString();
    const cacheKey = `dashboard:${auth.userId}:summary:${cacheQuery || "default"}`;
    const cached = getCache<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached }, { headers: privateCacheHeaders });
    }

    let parsed;
    try {
      parsed = parseDashboardRangeWithFilters(rawQuery);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.flatten() }, { status: 400 });
      }
      return NextResponse.json({ error: "Periodo invalido." }, { status: 400 });
    }

    const [legacySummary, currentLedger, previousLedger] = await Promise.all([
      dashboardMetricsRepo.getSummary({
        userId: auth.userId,
        range: parsed.range,
        filters: parsed.filters
      }),
      ledgerRepo.getDashboardSummary({
        userId: auth.userId,
        from: parsed.range.fromDate,
        to: parsed.range.toDate
      }),
      ledgerRepo.getDashboardSummary({
        userId: auth.userId,
        from: parsed.range.previousFromDate,
        to: parsed.range.previousToDate
      })
    ]);

    const hasLedgerData = currentLedger.ledgerEntryCount > 0 || previousLedger.ledgerEntryCount > 0;

    let cashBalance = currentLedger.cashBalance;
    let cardDebt = currentLedger.cardDebt;

    if (!hasLedgerData) {
      const accounts = await accountsRepo.listByUserWithBalance(auth.userId);
      cashBalance = accounts
        .filter((account) => account.type === "checking" || account.type === "cash")
        .map((account) => ({
          accountId: account.id,
          accountName: account.name,
          currency: account.currency,
          amount: account.currentBalance ?? 0
        }));
      cardDebt = accounts
        .filter((account) => account.type === "credit")
        .map((account) => ({
          creditCardAccountId: account.id,
          creditCardName: account.name,
          currency: account.currency,
          amount: Math.max(0, Number((-(account.currentBalance ?? 0)).toFixed(2)))
        }));
    }

    const currentIncome = hasLedgerData ? currentLedger.incomeTotal : legacySummary.totalIncome;
    const currentSpending = hasLedgerData ? currentLedger.totalSpending : legacySummary.totalExpense;
    const previousIncome = hasLedgerData
      ? previousLedger.incomeTotal
      : legacySummary.previousPeriodComparison.previousIncome;
    const previousSpending = hasLedgerData
      ? previousLedger.totalSpending
      : legacySummary.previousPeriodComparison.previousExpense;
    const currentNet = Number((currentIncome - currentSpending).toFixed(2));
    const previousNet = Number((previousIncome - previousSpending).toFixed(2));
    const delta = Number((currentNet - previousNet).toFixed(2));

    const payload = {
      ...legacySummary,
      totalIncome: currentIncome,
      totalExpense: currentSpending,
      net: currentNet,
      excludedTotal: hasLedgerData ? 0 : legacySummary.excludedTotal,
      previousPeriodComparison: {
        delta,
        percent: safeVariationPercent(currentNet, previousNet),
        previousNet,
        previousIncome,
        previousExpense: previousSpending,
        previousExcludedTotal: hasLedgerData ? 0 : legacySummary.previousPeriodComparison.previousExcludedTotal
      },
      cashBalance,
      totalSpending: currentSpending,
      incomeTotal: currentIncome,
      cardDebt,
      source: hasLedgerData ? "ledger" : "legacy"
    };

    setCache(cacheKey, payload, 10_000);

    return NextResponse.json({ data: payload }, { headers: privateCacheHeaders });
  });
}



