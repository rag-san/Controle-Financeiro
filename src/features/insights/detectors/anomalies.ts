import { formatBRL } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext, PreparedTransaction } from "@/src/features/insights/types";
import { median, percentile } from "@/src/features/insights/utils/stats";

type AnomalyCandidate = {
  transaction: PreparedTransaction;
  merchantMedian: number;
  percentile95: number;
  score: number;
};

export function detectAnomalies(context: InsightsDetectorContext): Insight | null {
  if (context.currentExpenses.length === 0) {
    return null;
  }

  const sortedExpenseValues = context.currentExpenses
    .map((item) => item.absAmount)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  const percentile95 = percentile(sortedExpenseValues, 95);

  const merchantHistoryMap = new Map<string, number[]>();
  for (const transaction of context.prepared) {
    if (transaction.type !== "expense") continue;
    if (transaction.merchantKey === "transacao") continue;
    const bucket = merchantHistoryMap.get(transaction.merchantKey) ?? [];
    bucket.push(transaction.absAmount);
    merchantHistoryMap.set(transaction.merchantKey, bucket);
  }

  let best: AnomalyCandidate | null = null;

  for (const transaction of context.currentExpenses) {
    const history = merchantHistoryMap.get(transaction.merchantKey) ?? [];
    const merchantMedian = median(history);
    const abovePercentile = percentile95 > 0 && transaction.absAmount >= percentile95;
    const aboveMerchantMedian = merchantMedian > 0 && transaction.absAmount >= merchantMedian * 3;

    if (!abovePercentile && !aboveMerchantMedian) {
      continue;
    }

    const scoreByPercentile = percentile95 > 0 ? transaction.absAmount / percentile95 : 1;
    const scoreByMerchant = merchantMedian > 0 ? transaction.absAmount / merchantMedian : 1;
    const score = Math.max(scoreByPercentile, scoreByMerchant);

    if (!best || score > best.score) {
      best = {
        transaction,
        merchantMedian,
        percentile95,
        score
      };
    }
  }

  if (!best) {
    return null;
  }

  return {
    id: "expense-anomaly",
    severity: "warning",
    title: "Despesa atípica detectada",
    message: `Gasto fora do padrão em ${best.transaction.merchantKey}: ${formatBRL(best.transaction.absAmount)}.`,
    why: `Típico para esse estabelecimento: ${formatBRL(best.merchantMedian)} | P95 do período: ${formatBRL(best.percentile95)}.`,
    cta: {
      label: "Investigar lançamento",
      href: `/transactions?${context.period.currentPeriod.query}&q=${encodeURIComponent(best.transaction.merchantKey)}`
    },
    impact: best.transaction.absAmount
  };
}
