import { formatBRL } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext, PreparedTransaction } from "@/src/features/insights/types";
import { median } from "@/src/features/insights/utils/stats";

const MIN_SUBSCRIPTION_MONTHS = 3;
const MIN_SUBSCRIPTION_AMOUNT = 20;
const MIN_CONSISTENT_MONTHS = 3;
const MIN_CONSISTENCY_RATIO = 0.6;

type SubscriptionCandidate = {
  merchantKey: string;
  months: number;
  medianAmount: number;
  medianDay: number;
  consistency: number;
};

type MonthlyObservation = {
  monthKey: string;
  amount: number;
  day: number;
};

function getMonthlyObservations(transactions: PreparedTransaction[]): MonthlyObservation[] {
  const monthBuckets = new Map<string, { amounts: number[]; days: number[] }>();

  for (const transaction of transactions) {
    const bucket = monthBuckets.get(transaction.monthKey) ?? { amounts: [], days: [] };
    bucket.amounts.push(transaction.absAmount);
    bucket.days.push(transaction.dayOfMonth);
    monthBuckets.set(transaction.monthKey, bucket);
  }

  return [...monthBuckets.entries()]
    .map(([monthKey, values]) => ({
      monthKey,
      amount: median(values.amounts),
      day: median(values.days)
    }))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function buildSubscriptionCandidate(
  merchantKey: string,
  transactions: PreparedTransaction[]
): SubscriptionCandidate | null {
  if (transactions.length < MIN_SUBSCRIPTION_MONTHS) {
    return null;
  }

  const monthly = getMonthlyObservations(transactions);
  if (monthly.length < MIN_SUBSCRIPTION_MONTHS) {
    return null;
  }

  const medianAmount = median(monthly.map((item) => item.amount));
  const medianDay = median(monthly.map((item) => item.day));
  if (medianAmount < MIN_SUBSCRIPTION_AMOUNT) {
    return null;
  }

  let consistentCount = 0;
  for (const item of monthly) {
    const amountDeviation = Math.abs(item.amount - medianAmount) / medianAmount;
    const dayDeviation = Math.abs(item.day - medianDay);
    if (amountDeviation <= 0.1 && dayDeviation <= 3) {
      consistentCount += 1;
    }
  }

  const consistencyRatio = consistentCount / monthly.length;
  if (consistentCount < MIN_CONSISTENT_MONTHS || consistencyRatio < MIN_CONSISTENCY_RATIO) {
    return null;
  }

  return {
    merchantKey,
    months: monthly.length,
    medianAmount,
    medianDay,
    consistency: consistencyRatio
  };
}

export function detectSubscriptions(context: InsightsDetectorContext): Insight | null {
  const expensesByMerchant = new Map<string, PreparedTransaction[]>();

  for (const transaction of context.prepared) {
    if (transaction.type !== "expense") continue;
    if (transaction.merchantKey === "transacao") continue;
    const bucket = expensesByMerchant.get(transaction.merchantKey) ?? [];
    bucket.push(transaction);
    expensesByMerchant.set(transaction.merchantKey, bucket);
  }

  let best: SubscriptionCandidate | null = null;

  for (const [merchantKey, transactions] of expensesByMerchant.entries()) {
    const candidate = buildSubscriptionCandidate(merchantKey, transactions);
    if (!candidate) continue;

    if (
      !best ||
      candidate.months > best.months ||
      (candidate.months === best.months && candidate.consistency > best.consistency)
    ) {
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  return {
    id: "subscription-detected",
    severity: "info",
    title: "Recorrência detectada",
    message: `Possível assinatura: ${best.merchantKey} (~${formatBRL(best.medianAmount)}/mês).`,
    why: `Ocorrências em ${best.months} meses, com variação de valor e dia dentro do esperado.`,
    cta: {
      label: "Ver lançamentos",
      href: `/transactions?period=90d&q=${encodeURIComponent(best.merchantKey)}`
    },
    impact: best.medianAmount
  };
}
