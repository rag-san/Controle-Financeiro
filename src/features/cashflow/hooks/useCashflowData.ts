"use client";

import { useEffect, useState } from "react";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { CashflowPeriodKey, CashflowViewData } from "@/src/features/cashflow/types";

type UseCashflowDataResult = {
  data: CashflowViewData | null;
  loading: boolean;
  error: string;
};

type CashflowMetricsResponse = {
  view: "cashflow";
  data: CashflowViewData;
};

export function useCashflowData(period: CashflowPeriodKey): UseCashflowDataResult {
  const [data, setData] = useState<CashflowViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError("");

      const query = new URLSearchParams({
        view: "cashflow",
        period
      });

      try {
        const response = await fetch(`/api/metrics/official?${query.toString()}`);
        const { data: payload, errorMessage } = await parseApiResponse<
          CashflowMetricsResponse | { error?: unknown }
        >(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !payload || !("view" in payload) || payload.view !== "cashflow") {
          throw new Error(extractApiError(payload, "Nao foi possivel carregar o fluxo de caixa oficial."));
        }

        if (!active) return;
        setData(payload.data);
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
