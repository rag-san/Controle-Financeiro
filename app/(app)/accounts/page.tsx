"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pie, PieChart, Tooltip } from "recharts";
import { PageShell } from "@/components/layout/PageShell";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { formatMoney } from "@/lib/money";
import type { AccountDTO } from "@/lib/types";

export default function AccountsPage(): React.JSX.Element {
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    type: "checking",
    institution: "",
    currency: "BRL"
  });

  const loadAccounts = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/accounts");
      const { data, errorMessage } = await parseApiResponse<AccountDTO[]>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data) {
        throw new Error("Nao foi possivel carregar contas.");
      }

      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar contas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const totals = useMemo(() => {
    return accounts.reduce(
      (acc, account) => {
        const value = account.currentBalance ?? 0;
        if (account.type === "credit") {
          acc.debts += Math.abs(Math.min(value, 0));
        } else {
          acc.assets += value;
        }
        return acc;
      },
      { assets: 0, debts: 0 }
    );
  }, [accounts]);

  const chartData = useMemo(
    () =>
      accounts.map((account, index) => ({
        name: account.name,
        value: Math.max(Math.abs(account.currentBalance ?? 0), 0),
        fill: ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#06b6d4"][index % 5]
      })),
    [accounts]
  );

  const handleCreate = async (): Promise<void> => {
    const trimmedName = form.name.trim();
    if (trimmedName.length < 2) {
      setError("Informe um nome de conta com pelo menos 2 caracteres.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: trimmedName
        })
      });

      const { data, errorMessage } = await parseApiResponse<AccountDTO | { error?: unknown }>(response);

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (!response.ok || !data) {
        throw new Error(extractApiError(data, "Nao foi possivel criar conta."));
      }

      setForm({ name: "", type: "checking", institution: "", currency: "BRL" });
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar conta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Contas" subtitle="Gerencie contas bancarias, carteiras e cartoes">
      {loading ? (
        <Skeleton className="h-[420px]" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(totals.assets)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Dividas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(totals.debts)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Saldo consolidado</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(totals.assets - totals.debts)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nova conta</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Input
                placeholder="Nome"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="checking">Conta corrente</option>
                <option value="credit">Cartao de credito</option>
                <option value="cash">Dinheiro</option>
                <option value="investment">Investimento</option>
              </Select>
              <Input
                placeholder="Instituicao"
                value={form.institution}
                onChange={(event) => setForm((prev) => ({ ...prev, institution: event.target.value }))}
              />
              <Input
                placeholder="Moeda"
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
              />
              <Button onClick={() => void handleCreate()} disabled={saving} className="w-full md:w-auto">
                {saving ? "Salvando..." : "Salvar conta"}
              </Button>
            </CardContent>
          </Card>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Lista de contas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.institution || "Sem instituicao"} • {account.type}
                        </p>
                      </div>
                      <div className="font-semibold sm:text-right">{formatMoney(account.currentBalance ?? 0)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuicao</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartFrame className="h-72" minHeight={280}>
                  {({ width, height }) => (
                    <PieChart width={width} height={height}>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={Math.max(Math.min(width, height) * 0.32, 70)}
                        innerRadius={Math.max(Math.min(width, height) * 0.16, 38)}
                      />
                      <Tooltip />
                    </PieChart>
                  )}
                </ChartFrame>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}


