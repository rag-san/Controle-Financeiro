"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";

type ReportsPayload = {
  summary: {
    income: number;
    expense: number;
    saved: number;
  };
  sankey: {
    phase: number;
    enabled: boolean;
    message: string;
  };
};

export default function ReportsPage(): React.JSX.Element {
  const [data, setData] = useState<ReportsPayload | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const response = await fetch("/api/reports");
      const json = (await response.json()) as ReportsPayload;
      setData(json);
    };

    void load();
  }, []);

  return (
    <PageShell title="Relatorios" subtitle="Resumo e estrutura pronta para analises avancadas">
      {!data ? (
        <Skeleton className="h-[340px]" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Receitas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-emerald-600">{formatMoney(data.summary.income)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-rose-600">{formatMoney(data.summary.expense)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Economizado</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(data.summary.saved)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sankey (fase 2)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{data.sankey.message}</p>
              <div className="rounded-xl border border-dashed border-border bg-muted/25 p-6 text-sm text-muted-foreground">
                Placeholder funcional: endpoint pronto em <code>/api/reports</code> para evolucao do Sankey.
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}


