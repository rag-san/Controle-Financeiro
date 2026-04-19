import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";
import { buildInsights } from "@/src/features/insights/buildInsights";
import { buildPeriodComparison } from "@/src/features/insights/utils/period";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/insights.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const period = buildPeriodComparison({
      referenceDate: new Date(),
      range: "this-month"
    });

    const [categories, transactions] = await Promise.all([
      categoriesRepo.listByUser(auth.userId),
      transactionsRepo.listAll({
        userId: auth.userId,
        dateFrom: period.previousPeriod.start,
        dateTo: period.currentPeriod.end,
        excluded: false,
        hideCardPaymentMirrorInflow: true
      })
    ]);

    const insights = buildInsights({
      transactions: transactions.map((transaction) => ({
        ...transaction,
        date: transaction.date.toISOString()
      })),
      categories,
      period,
      today: new Date()
    }).slice(0, 6);

    return NextResponse.json(
      {
        insights
      },
      {
        headers: privateCacheHeaders
      }
    );
  });
}
