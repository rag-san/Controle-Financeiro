import type { ReportsCashSummary, ReportsTotals } from "@/src/features/reports/types";
import { formatBRL } from "@/src/utils/format";

export type KpiTrend = {
  deltaPercent: number | null;
  direction: "up" | "down" | "flat" | "na";
};

export type ReportKpi = {
  id: "income" | "expense" | "cash-outflow" | "cash-balance";
  label: string;
  value: number;
  trend: KpiTrend;
  helpText: string;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function computeTrend(current: number, previous: number): KpiTrend {
  if (!Number.isFinite(previous) || previous === 0) {
    return { deltaPercent: null, direction: "na" };
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(delta)) {
    return { deltaPercent: null, direction: "na" };
  }

  if (delta > 0.0001) {
    return { deltaPercent: round2(delta), direction: "up" };
  }
  if (delta < -0.0001) {
    return { deltaPercent: round2(delta), direction: "down" };
  }

  return { deltaPercent: 0, direction: "flat" };
}

export function buildReportKpis(input: {
  current: ReportsTotals;
  previous: ReportsTotals;
  cash: ReportsCashSummary;
}): ReportKpi[] {
  const { current, previous, cash } = input;

  return [
    {
      id: "income",
      label: "Receitas",
      value: current.income,
      trend: computeTrend(current.income, previous.income),
      helpText: "vs período anterior"
    },
    {
      id: "expense",
      label: "Despesas",
      value: current.expense,
      trend: computeTrend(current.expense, previous.expense),
      helpText: "Despesas classificadas vs período anterior"
    },
    {
      id: "cash-outflow",
      label: "Saída real de caixa",
      value: cash.outflow,
      trend: computeTrend(cash.outflow, cash.previousOutflow),
      helpText: `Despesas classificadas no período: ${formatBRL(current.expense)}`
    },
    {
      id: "cash-balance",
      label: "Saldo em conta",
      value: cash.cashBalance,
      trend: computeTrend(cash.net, cash.previousNet),
      helpText: `Variação real no período: ${formatBRL(cash.net)}`
    }
  ];
}
