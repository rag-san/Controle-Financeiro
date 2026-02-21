import { differenceInCalendarDays, isAfter, min } from "date-fns";
import { formatBRL, formatPercent } from "@/src/utils/format";
import type { Insight, InsightsDetectorContext } from "@/src/features/insights/types";

function sumExpenses(items: InsightsDetectorContext["currentExpenses"]): number {
  let total = 0;
  for (const item of items) {
    total += item.absAmount;
  }
  return total;
}

export function detectSpendPace(context: InsightsDetectorContext): Insight | null {
  const previousTotal = sumExpenses(context.previousExpenses);
  if (previousTotal <= 0) {
    return null;
  }

  const currentPeriod = context.period.currentPeriod;
  const capDate = min([context.today, currentPeriod.end]);
  const elapsedDays = Math.max(1, differenceInCalendarDays(capDate, currentPeriod.start) + 1);
  const totalDays = Math.max(1, differenceInCalendarDays(currentPeriod.end, currentPeriod.start) + 1);

  let currentSoFar = 0;
  for (const expense of context.currentExpenses) {
    if (!isAfter(expense.date, capDate)) {
      currentSoFar += expense.absAmount;
    }
  }

  const expected = previousTotal * (elapsedDays / totalDays);
  if (expected <= 0) {
    return null;
  }

  const deltaPercent = ((currentSoFar - expected) / expected) * 100;
  const faster = deltaPercent > 0;
  const severity: Insight["severity"] = deltaPercent >= 12 ? "warning" : "info";

  return {
    id: "spend-pace",
    severity,
    title: "Ritmo de gastos",
    message: faster
      ? `Você está gastando ${formatPercent(Math.abs(deltaPercent))} mais rápido que o período anterior.`
      : `Seu gasto está ${formatPercent(Math.abs(deltaPercent))} abaixo do ritmo do período anterior.`,
    why: `Gasto atual até agora: ${formatBRL(currentSoFar)} | Esperado pelo histórico: ${formatBRL(expected)}.`,
    cta: {
      label: "Ver despesas",
      href: `/transactions?${currentPeriod.query}&type=expense`
    },
    impact: Math.abs(deltaPercent)
  };
}
