"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CashflowBar } from "@/components/charts/CashflowBar";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { formatMoney } from "@/lib/money";

type CashflowPayload = {
  cards: {
    income: number;
    expense: number;
    result: number;
  };
  cashflow: {
    month: string;
    income: number;
    expense: number;
    balance: number;
  }[];
};

function isCashflowPayload(value: unknown): value is CashflowPayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<CashflowPayload>;
  if (!candidate.cards || typeof candidate.cards !== "object") return false;

  const cards = candidate.cards as Partial<CashflowPayload["cards"]>;
  return (
    typeof cards.income === "number" &&
    typeof cards.expense === "number" &&
    typeof cards.result === "number" &&
    Array.isArray(candidate.cashflow)
  );
}

export default function CashflowPage(): React.JSX.Element {
  const [data, setData] = useState<CashflowPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/dashboard");
        const { data: payload, errorMessage } = await parseApiResponse<
          CashflowPayload | { error?: unknown }
        >(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !payload) {
          throw new Error(extractApiError(payload, "Nao foi possivel carregar fluxo de caixa."));
        }

        if (!isCashflowPayload(payload)) {
          throw new Error("Resposta invalida do fluxo de caixa.");
        }

        setData(payload);
      } catch (loadError) {
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "Erro ao carregar fluxo de caixa.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <PageShell title="Fluxo de Caixa" subtitle="Receitas, despesas e saldo mes a mes">
      {loading ? (
        <Skeleton className="h-[440px]" />
      ) : !data ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-300">
            {error || "Nao foi possivel carregar os dados do fluxo de caixa."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Resultado liquido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(data.cards.result)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Receitas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-emerald-600">{formatMoney(data.cards.income)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-rose-600">{formatMoney(data.cards.expense)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historico mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <CashflowBar data={data.cashflow} />
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}


