"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { PageShell } from "@/components/layout/PageShell";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";

type Entry = {
  id: string;
  type: "asset" | "debt";
  name: string;
  value: number;
  date: string;
  group?: string | null;
};

export default function NetWorthPage(): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "asset",
    name: "",
    value: "",
    date: new Date().toISOString().slice(0, 10),
    group: "cash"
  });

  const loadEntries = async (): Promise<void> => {
    setLoading(true);
    const response = await fetch("/api/net-worth");
    const data = (await response.json()) as Entry[];
    setEntries(data);
    setLoading(false);
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const timeline = useMemo(() => {
    const grouped = entries.reduce<Record<string, { assets: number; debts: number }>>((acc, entry) => {
      const key = entry.date.slice(0, 10);
      if (!acc[key]) {
        acc[key] = { assets: 0, debts: 0 };
      }
      if (entry.type === "asset") {
        acc[key].assets += entry.value;
      } else {
        acc[key].debts += entry.value;
      }
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([date, values]) => ({
        date,
        assets: Number(values.assets.toFixed(2)),
        debts: Number(values.debts.toFixed(2)),
        net: Number((values.assets - values.debts).toFixed(2))
      }));
  }, [entries]);

  const latest = timeline[timeline.length - 1] ?? { assets: 0, debts: 0, net: 0 };

  const handleCreate = async (): Promise<void> => {
    if (!form.name || !form.value) return;

    await fetch("/api/net-worth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        value: Number(form.value)
      })
    });

    setForm((previous) => ({ ...previous, name: "", value: "" }));
    await loadEntries();
  };

  return (
    <PageShell title="Patrimonio" subtitle="Acompanhe ativos, dividas e evolucao historica">
      {loading ? (
        <Skeleton className="h-[460px]" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Patrimonio liquido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(latest.net)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-emerald-600">{formatMoney(latest.assets)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Dividas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-rose-600">{formatMoney(latest.debts)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Evolucao do patrimonio</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartFrame className="h-72" minHeight={280}>
                {({ width, height }) => (
                  <AreaChart width={width} height={height} data={timeline}>
                    <defs>
                      <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="net" stroke="#2563eb" fill="url(#netGradient)" />
                  </AreaChart>
                )}
              </ChartFrame>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Novo registro de patrimonio</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-6">
              <Select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="asset">Ativo</option>
                <option value="debt">Divida</option>
              </Select>
              <Input
                placeholder="Nome"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                placeholder="Valor"
                type="number"
                value={form.value}
                onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
              />
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              />
              <Input
                placeholder="Grupo"
                value={form.group}
                onChange={(event) => setForm((prev) => ({ ...prev, group: event.target.value }))}
              />
              <Button onClick={() => void handleCreate()} className="w-full md:w-auto">
                Salvar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}


