import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reports.GET", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `reports:${auth.userId}:summary`;
  const cached = getCache<{
    summary: {
      income: number;
      expense: number;
      saved: number;
    };
    sankey: {
      phase: number;
      enabled: boolean;
      message: string;
      nodes: unknown[];
      links: unknown[];
    };
  }>(cacheKey);

  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const transactions = transactionsRepo.listRecentAmounts(auth.userId, 500);

  const totals = transactions.reduce(
    (acc, transaction) => {
      const amount = transaction.amount;
      if (amount >= 0) {
        acc.income += amount;
      } else {
        acc.expense += Math.abs(amount);
      }
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const payload = {
    summary: {
      income: Number(totals.income.toFixed(2)),
      expense: Number(totals.expense.toFixed(2)),
      saved: Number((totals.income - totals.expense).toFixed(2))
    },
    sankey: {
      phase: 2,
      enabled: false,
      message: "Estrutura pronta para Sankey; implementacao visual fica para fase 2.",
      nodes: [],
      links: []
    }
  };

  setCache(cacheKey, payload, 30_000);

  return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}


