import { format } from "date-fns";
import { formatBRL } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext, PreparedTransaction } from "@/src/features/insights/types";

type DuplicateCandidate = {
  merchantKey: string;
  amount: number;
  occurrences: number;
  sampleDate: Date;
};

function findCandidateInGroup(group: PreparedTransaction[]): DuplicateCandidate | null {
  if (group.length < 2) return null;

  const ordered = [...group].sort((left, right) => left.timestamp - right.timestamp);
  let duplicateCount = 1;
  let maxCount = 1;
  let sampleDate = ordered[0].date;

  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previous = ordered[index - 1];
    const diffMs = current.timestamp - previous.timestamp;

    if (diffMs <= 48 * 60 * 60 * 1000) {
      duplicateCount += 1;
      if (duplicateCount > maxCount) {
        maxCount = duplicateCount;
        sampleDate = current.date;
      }
    } else {
      duplicateCount = 1;
    }
  }

  if (maxCount < 2) return null;

  return {
    merchantKey: ordered[0].merchantKey,
    amount: ordered[0].absAmount,
    occurrences: maxCount,
    sampleDate
  };
}

export function detectDuplicates(context: InsightsDetectorContext): Insight | null {
  const groups = new Map<string, PreparedTransaction[]>();

  for (const transaction of context.currentExpenses) {
    if (transaction.merchantKey === "transacao") continue;
    const amountCents = Math.round(transaction.absAmount * 100);
    const key = `${transaction.merchantKey}|${amountCents}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(transaction);
    groups.set(key, bucket);
  }

  let best: DuplicateCandidate | null = null;

  for (const group of groups.values()) {
    const candidate = findCandidateInGroup(group);
    if (!candidate) continue;

    if (!best || candidate.occurrences > best.occurrences) {
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  const dateLabel = format(best.sampleDate, "dd/MM");

  return {
    id: "duplicate-charge",
    severity: "warning",
    title: "Possível cobrança duplicada",
    message: `${best.merchantKey} ${formatBRL(best.amount)} apareceu ${best.occurrences}x em até 48h.`,
    why: `Ocorrências detectadas em ${dateLabel} com mesmo valor e mesmo estabelecimento.`,
    cta: {
      label: "Revisar transações",
      href: `/transactions?${context.period.currentPeriod.query}&q=${encodeURIComponent(best.merchantKey)}`
    },
    impact: best.amount * best.occurrences
  };
}
