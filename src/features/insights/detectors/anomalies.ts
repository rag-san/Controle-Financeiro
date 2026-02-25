import { formatBRL } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext, PreparedTransaction } from "@/src/features/insights/types";
import { median, percentile } from "@/src/features/insights/utils/stats";

const ANOMALY_PERCENTILE = 97;
const MIN_PERIOD_SAMPLES = 8;
const MIN_TRANSACTION_AMOUNT = 80;
const MIN_MERCHANT_HISTORY = 3;
const MERCHANT_SPIKE_MULTIPLIER = 3.5;
const MIN_ANOMALY_SCORE = 1.2;

type AnomalyCandidate = {
  transaction: PreparedTransaction;
  merchantMedian: number;
  percentile97: number;
  merchantHistoryCount: number;
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

  if (sortedExpenseValues.length < MIN_PERIOD_SAMPLES) {
    return null;
  }

  const percentile97 = percentile(sortedExpenseValues, ANOMALY_PERCENTILE);

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
    if (transaction.absAmount < MIN_TRANSACTION_AMOUNT) {
      continue;
    }

    const history = merchantHistoryMap.get(transaction.merchantKey) ?? [];
    const merchantMedian = median(history);
    const hasMerchantBaseline = history.length >= MIN_MERCHANT_HISTORY && merchantMedian > 0;

    const abovePercentile = percentile97 > 0 && transaction.absAmount >= percentile97;
    const aboveMerchantMedian =
      hasMerchantBaseline && transaction.absAmount >= merchantMedian * MERCHANT_SPIKE_MULTIPLIER;

    if (!abovePercentile && !aboveMerchantMedian) {
      continue;
    }

    const scoreByPercentile = percentile97 > 0 ? transaction.absAmount / percentile97 : 1;
    const scoreByMerchant = hasMerchantBaseline ? transaction.absAmount / merchantMedian : 1;
    const score = Math.max(scoreByPercentile, scoreByMerchant);

    if (score < MIN_ANOMALY_SCORE) {
      continue;
    }

    if (!best || score > best.score) {
      best = {
        transaction,
        merchantMedian,
        percentile97,
        merchantHistoryCount: history.length,
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
    why: `Histórico (${best.merchantHistoryCount} lançamentos): ${formatBRL(best.merchantMedian)} | P${ANOMALY_PERCENTILE}: ${formatBRL(best.percentile97)}.`,
    cta: {
      label: "Investigar lançamento",
      href: `/transactions?${context.period.currentPeriod.query}&q=${encodeURIComponent(best.transaction.merchantKey)}`
    },
    impact: best.transaction.absAmount
  };
}
