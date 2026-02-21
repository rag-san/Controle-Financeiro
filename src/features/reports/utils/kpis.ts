import type { ReportsTotals } from "@/src/features/reports/types";

export type KpiTrend = {
  deltaPercent: number | null;
  direction: "up" | "down" | "flat" | "na";
};

export type ReportKpi = {
  id: "income" | "expense" | "saved" | "savings-rate";
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
}): ReportKpi[] {
  const { current, previous } = input;

  const kpis: ReportKpi[] = [
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
      helpText: "vs período anterior"
    },
    {
      id: "saved",
      label: "Economizado",
      value: current.net,
      trend: computeTrend(current.net, previous.net),
      helpText: "vs período anterior"
    }
  ];

  if (current.income > 0) {
    const currentRate = round2((current.net / current.income) * 100);
    const previousRate = previous.income > 0 ? round2((previous.net / previous.income) * 100) : 0;

    kpis.push({
      id: "savings-rate",
      label: "Taxa de economia",
      value: currentRate,
      trend: computeTrend(currentRate, previousRate),
      helpText: "vs período anterior"
    });
  }

  return kpis;
}

