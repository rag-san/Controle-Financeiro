import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { transactionsRepo } from "@/lib/server/transactions.repo";

type SankeyNode = {
  name: string;
  kind: "income" | "balance" | "expense";
  color: string;
};

type SankeyLink = {
  source: number;
  target: number;
  value: number;
  color: string;
};

type ReportsResponse = {
  summary: {
    income: number;
    expense: number;
    saved: number;
  };
  sankey: {
    phase: number;
    enabled: boolean;
    message: string;
    nodes: SankeyNode[];
    links: SankeyLink[];
  };
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toTopEntries(
  source: Map<string, number>,
  limit: number,
  otherLabel: string
): Array<{ name: string; value: number }> {
  const entries = [...source.entries()]
    .map(([name, value]) => ({ name, value: round2(value) }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value);

  if (entries.length <= limit) {
    return entries;
  }

  const top = entries.slice(0, limit);
  const otherTotal = round2(entries.slice(limit).reduce((sum, entry) => sum + entry.value, 0));
  if (otherTotal > 0) {
    top.push({ name: otherLabel, value: otherTotal });
  }

  return top;
}

function buildSankey(
  transactions: Array<{
    amount: number;
    type: "income" | "expense";
    account: { name: string } | null;
    category?: { name: string } | null;
  }>
): { nodes: SankeyNode[]; links: SankeyLink[]; income: number; expense: number } {
  const incomeByAccount = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();

  for (const transaction of transactions) {
    const absoluteAmount = round2(Math.abs(transaction.amount));
    if (!Number.isFinite(absoluteAmount) || absoluteAmount <= 0) continue;

    if (transaction.type === "income") {
      const accountName = transaction.account?.name?.trim() || "Outras receitas";
      const current = incomeByAccount.get(accountName) ?? 0;
      incomeByAccount.set(accountName, round2(current + absoluteAmount));
      continue;
    }

    const categoryName = transaction.category?.name?.trim() || "Sem categoria";
    const current = expenseByCategory.get(categoryName) ?? 0;
    expenseByCategory.set(categoryName, round2(current + absoluteAmount));
  }

  const incomeEntries = toTopEntries(incomeByAccount, 6, "Outras receitas");
  const expenseEntries = toTopEntries(expenseByCategory, 8, "Outras despesas");

  const totalIncome = round2(incomeEntries.reduce((sum, entry) => sum + entry.value, 0));
  const totalExpense = round2(expenseEntries.reduce((sum, entry) => sum + entry.value, 0));

  const nodes: SankeyNode[] = [
    ...incomeEntries.map((entry) => ({
      name: entry.name,
      kind: "income" as const,
      color: "#10b981"
    })),
    {
      name: "Disponível",
      kind: "balance",
      color: "#3b82f6"
    },
    ...expenseEntries.map((entry) => ({
      name: entry.name,
      kind: "expense" as const,
      color: "#f43f5e"
    }))
  ];

  const balanceIndex = incomeEntries.length;
  const links: SankeyLink[] = [
    ...incomeEntries.map((entry, index) => ({
      source: index,
      target: balanceIndex,
      value: entry.value,
      color: "rgba(16, 185, 129, 0.35)"
    })),
    ...expenseEntries.map((entry, index) => ({
      source: balanceIndex,
      target: balanceIndex + 1 + index,
      value: entry.value,
      color: "rgba(244, 63, 94, 0.35)"
    }))
  ];

  return {
    nodes,
    links,
    income: totalIncome,
    expense: totalExpense
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/reports.GET", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `reports:${auth.userId}:summary`;
  const cached = getCache<ReportsResponse>(cacheKey);

  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const transactions = transactionsRepo.listPaged(
    { userId: auth.userId },
    { page: 1, pageSize: 500 }
  );

  const sankeyData = buildSankey(transactions);

  const payload: ReportsResponse = {
    summary: {
      income: sankeyData.income,
      expense: sankeyData.expense,
      saved: round2(sankeyData.income - sankeyData.expense)
    },
    sankey: {
      phase: 2,
      enabled: sankeyData.links.length > 0,
      message:
        sankeyData.links.length > 0
          ? "Fluxo de receitas e despesas calculado a partir das últimas 500 transações."
          : "Sem dados suficientes para gerar o Sankey neste período.",
      nodes: sankeyData.nodes,
      links: sankeyData.links
    }
  };

  setCache(cacheKey, payload, 30_000);

  return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}


