"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import type { CategoryDTO } from "@/lib/types";

type RecurringDTO = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  status: "active" | "inactive";
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
    color: string;
  } | null;
};

type RecurringBootstrapResponse = {
  items: RecurringDTO[];
  categories: CategoryDTO[];
};

export default function RecurringPage(): React.JSX.Element {
  const [items, setItems] = useState<RecurringDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    dueDay: String(new Date().getDate()),
    categoryId: ""
  });

  const load = async (): Promise<void> => {
    setLoading(true);
    const response = await fetch("/api/recurring/bootstrap");
    const data = (await response.json()) as RecurringBootstrapResponse;

    setItems(data.items);
    setCategories(data.categories);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    const active = items.filter((item) => item.status === "active");
    const activeTotal = active.reduce((sum, item) => sum + item.amount, 0);
    const inactiveTotal = items
      .filter((item) => item.status === "inactive")
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      activeCount: active.length,
      activeTotal,
      inactiveTotal
    };
  }, [items]);

  const handleCreate = async (): Promise<void> => {
    if (!form.name || !form.amount) return;

    await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        amount: Number(form.amount),
        dueDay: Number(form.dueDay),
        categoryId: form.categoryId || null
      })
    });

    setForm((previous) => ({ ...previous, name: "", amount: "" }));
    await load();
  };

  const handleToggleStatus = async (item: RecurringDTO): Promise<void> => {
    await fetch(`/api/recurring/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: item.status === "active" ? "inactive" : "active"
      })
    });

    await load();
  };

  return (
    <PageShell title="Recorrentes" subtitle="Assinaturas e contas mensais">
      {loading ? (
        <Skeleton className="h-[420px]" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">A pagar este mes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(totals.activeTotal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{totals.activeCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Inativos (historico)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(totals.inactiveTotal)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Novo recorrente</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Input
                placeholder="Nome"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                type="number"
                placeholder="Valor"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              />
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="Dia vencimento"
                value={form.dueDay}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDay: event.target.value }))}
              />
              <Select
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Button onClick={() => void handleCreate()} className="w-full md:w-auto">
                Salvar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lista de recorrentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item recorrente cadastrado.</p>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Dia {item.dueDay} • {item.category?.name || "Sem categoria"}
                        </p>
                      </div>
                      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                        <span className="font-semibold">{formatMoney(item.amount)}</span>
                        <Button variant="outline" size="sm" onClick={() => void handleToggleStatus(item)}>
                          {item.status === "active" ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}


