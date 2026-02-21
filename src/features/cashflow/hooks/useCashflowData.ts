"use client";

import { useEffect, useState } from "react";
import { endOfDay } from "date-fns";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { TransactionDTO } from "@/lib/types";
import type { CashflowPeriodKey, CashflowViewData, DateRange } from "@/src/features/cashflow/types";
import {
  calculateTotals,
  formatRange,
  resolveCurrentRange,
  resolvePreviousRange,
  splitByRange,
  toComparisonMetric,
  toIsoDate
} from "@/src/features/cashflow/utils/cashflow";
import { buildMonthlyExpensesStack } from "@/src/features/cashflow/utils/expensesStack";
import { buildMonthlyNetResult } from "@/src/features/cashflow/utils/netResult";
import { buildMonthlyIncome } from "@/src/features/cashflow/utils/income";

type TransactionsResponse = {
  items: TransactionDTO[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type UseCashflowDataResult = {
  data: CashflowViewData | null;
  loading: boolean;
  error: string;
};

async function fetchPagedTransactions(range: DateRange): Promise<TransactionDTO[]> {
  const items: TransactionDTO[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const params = new URLSearchParams({
      period: "custom",
      from: toIsoDate(range.from),
      to: endOfDay(range.to).toISOString(),
      page: String(page),
      pageSize: "200"
    });

    const response = await fetch(`/api/transactions?${params.toString()}`);
    const { data, errorMessage } = await parseApiResponse<TransactionsResponse | { error?: unknown }>(response);

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    if (!response.ok || !data || !("items" in data)) {
      throw new Error(extractApiError(data, "Nao foi possivel carregar dados de fluxo de caixa."));
    }

    items.push(...data.items);
    hasNextPage = data.pagination.hasNextPage;
    page += 1;
  }

  return items;
}

async function fetchLatestTransactionDate(): Promise<Date> {
  const params = new URLSearchParams({
    period: "all",
    page: "1",
    pageSize: "10"
  });

  const response = await fetch(`/api/transactions?${params.toString()}`);
  const { data, errorMessage } = await parseApiResponse<TransactionsResponse | { error?: unknown }>(response);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (!response.ok || !data || !("items" in data)) {
    throw new Error(extractApiError(data, "Nao foi possivel determinar o periodo de referencia."));
  }

  const latestItem = data.items[0];
  return latestItem ? new Date(latestItem.date) : new Date();
}

export function useCashflowData(period: CashflowPeriodKey): UseCashflowDataResult {
  const [data, setData] = useState<CashflowViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError("");

      try {
        const referenceDate = await fetchLatestTransactionDate();
        const currentRange = resolveCurrentRange(period, referenceDate);
        const previousRange = resolvePreviousRange(currentRange);

        const mergedRange: DateRange = {
          from: previousRange.from,
          to: currentRange.to
        };

        const rangeTransactions = await fetchPagedTransactions(mergedRange);
        const currentTransactions = splitByRange(rangeTransactions, currentRange);
        const previousTransactions = splitByRange(rangeTransactions, previousRange);

        const currentTotals = calculateTotals(currentTransactions);
        const previousTotals = calculateTotals(previousTransactions);

        const payload: CashflowViewData = {
          currentRangeLabel: formatRange(currentRange),
          previousRangeLabel: formatRange(previousRange),
          netResult: toComparisonMetric(currentTotals.net, previousTotals.net),
          income: toComparisonMetric(currentTotals.income, previousTotals.income),
          expense: toComparisonMetric(currentTotals.expense, previousTotals.expense),
          netChart: buildMonthlyNetResult(currentTransactions, {
            start: currentRange.from,
            end: currentRange.to,
            previousTransactions,
            previousStart: previousRange.from,
            previousEnd: previousRange.to
          }),
          incomeChart: buildMonthlyIncome(currentTransactions, {
            start: currentRange.from,
            end: currentRange.to
          }),
          expensesChart: buildMonthlyExpensesStack(currentTransactions, { topN: 8 })
        };

        if (!active) return;
        setData(payload);
      } catch (loadError) {
        if (!active) return;
        setData(null);
        setError(
          loadError instanceof Error ? loadError.message : "Nao foi possivel carregar o fluxo de caixa."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [period]);

  return { data, loading, error };
}
