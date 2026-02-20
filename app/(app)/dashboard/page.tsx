"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { SpendingTrend } from "@/components/charts/SpendingTrend";
import { CashflowBar } from "@/components/charts/CashflowBar";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type DashboardPayload = {
  referenceMonth: string;
  isCurrentMonthReference: boolean;
  cards: {
    income: number;
    expense: number;
    result: number;
    netWorth: number;
    spendPaceDelta: number;
    resultDelta: number;
  };
  spendingTrend: { day: number; current: number; previous: number }[];
  topCategories: {
    categoryId: string;
    name: string;
    color: string;
    current: number;
    previous: number;
    variation: number;
  }[];
  cashflow: {
    month: string;
    income: number;
    expense: number;
    balance: number;
  }[];
};

function isDashboardPayload(value: unknown): value is DashboardPayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<DashboardPayload>;
  if (!candidate.cards || typeof candidate.cards !== "object") return false;

  const cards = candidate.cards as Partial<DashboardPayload["cards"]>;
  return (
    typeof candidate.referenceMonth === "string" &&
    typeof candidate.isCurrentMonthReference === "boolean" &&
    typeof cards.income === "number" &&
    typeof cards.expense === "number" &&
    typeof cards.result === "number" &&
    typeof cards.netWorth === "number" &&
    typeof cards.spendPaceDelta === "number" &&
    typeof cards.resultDelta === "number" &&
    Array.isArray(candidate.spendingTrend) &&
    Array.isArray(candidate.topCategories) &&
    Array.isArray(candidate.cashflow)
  );
}

function formatReferenceMonth(value: string): string {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${month}/${year}`;
}

function MetricCard({
  label,
  value,
  delta,
  positive = true
}: {
  label: string;
  value: number;
  delta?: number;
  positive?: boolean;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{formatMoney(value)}</p>
        {delta !== undefined ? (
          <p className={cn("mt-1 text-xs font-medium", positive ? "text-emerald-600" : "text-rose-600")}>
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}% vs mes anterior
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/dashboard");
        const { data: payload, errorMessage } = await parseApiResponse<
          DashboardPayload | { error?: unknown }
        >(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !payload) {
          throw new Error(extractApiError(payload, "Nao foi possivel carregar o dashboard."));
        }

        if (!isDashboardPayload(payload)) {
          throw new Error("Resposta invalida do dashboard.");
        }

        setData(payload);
      } catch (loadError) {
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "Erro ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <PageShell
      title="Dashboard"
      subtitle="Visao geral financeira com comparativos do mes atual"
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-80" />
          <Skeleton className="h-72" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-300">
            {error || "Nao foi possivel carregar os dados do dashboard."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {!data.isCurrentMonthReference ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Sem lancamentos no mes atual. Exibindo dados de referencia de {formatReferenceMonth(data.referenceMonth)}.
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Resultado do mes" value={data.cards.result} delta={data.cards.resultDelta} positive={data.cards.result >= 0} />
            <MetricCard label="Gastos do mes" value={data.cards.expense} delta={data.cards.spendPaceDelta} positive={false} />
            <MetricCard label="Receita do mes" value={data.cards.income} />
            <MetricCard label="Patrimonio" value={data.cards.netWorth} positive={data.cards.netWorth >= 0} />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Tendencia de gastos acumulados</CardTitle>
              </CardHeader>
              <CardContent>
                <SpendingTrend data={data.spendingTrend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Principais categorias</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryBars data={data.topCategories} />
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle>Fluxo de caixa mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <CashflowBar data={data.cashflow} />
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </PageShell>
  );
}


