"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountDTO, CategoryDTO } from "@/lib/types";

type RuleDTO = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  matchType: "contains" | "regex";
  pattern: string;
  accountId?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  categoryId: string;
  category: CategoryDTO;
  account?: AccountDTO | null;
};

type CategoriesBootstrapResponse = {
  categories: CategoryDTO[];
  rules: RuleDTO[];
  accounts: AccountDTO[];
};

export default function CategoriesPage(): React.JSX.Element {
  const [tab, setTab] = useState<"categories" | "automations">("categories");
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [rules, setRules] = useState<RuleDTO[]>([]);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    color: "#3b82f6",
    icon: "Tag"
  });

  const [ruleForm, setRuleForm] = useState({
    name: "",
    priority: "100",
    matchType: "contains",
    pattern: "",
    accountId: "",
    minAmount: "",
    maxAmount: "",
    categoryId: ""
  });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const response = await fetch("/api/categories/bootstrap");
    const data = (await response.json()) as CategoriesBootstrapResponse;

    setCategories(data.categories);
    setRules(data.rules);
    setAccounts(data.accounts);

    setRuleForm((prev) =>
      !prev.categoryId && data.categories[0] ? { ...prev, categoryId: data.categories[0].id } : prev
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createCategory = async (): Promise<void> => {
    if (!categoryForm.name) return;

    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(categoryForm)
    });

    setCategoryForm((prev) => ({ ...prev, name: "" }));
    await load();
  };

  const removeCategory = async (id: string): Promise<void> => {
    await fetch(`/api/categories/${id}`, { method: "DELETE" });
    await load();
  };

  const createRule = async (): Promise<void> => {
    if (!ruleForm.name || !ruleForm.pattern || !ruleForm.categoryId) return;

    await fetch("/api/categories/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ruleForm.name,
        priority: Number(ruleForm.priority),
        matchType: ruleForm.matchType,
        pattern: ruleForm.pattern,
        accountId: ruleForm.accountId || null,
        minAmount: ruleForm.minAmount ? Number(ruleForm.minAmount) : null,
        maxAmount: ruleForm.maxAmount ? Number(ruleForm.maxAmount) : null,
        categoryId: ruleForm.categoryId
      })
    });

    setRuleForm((prev) => ({
      ...prev,
      name: "",
      pattern: "",
      minAmount: "",
      maxAmount: ""
    }));
    await load();
  };

  const toggleRule = async (rule: RuleDTO): Promise<void> => {
    await fetch(`/api/categories/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled })
    });
    await load();
  };

  const removeRule = async (id: string): Promise<void> => {
    await fetch(`/api/categories/rules/${id}`, { method: "DELETE" });
    await load();
  };

  const reapplyRules = async (): Promise<void> => {
    await fetch("/api/categories/reapply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyUncategorized: false })
    });
    await load();
  };

  const restoreDefaults = async (): Promise<void> => {
    setRestoringDefaults(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/categories/bootstrap", {
        method: "POST"
      });

      const data = (await response.json()) as
        | {
            createdCategories: number;
            createdRules: number;
            totalCategories: number;
            totalRules: number;
          }
        | { error?: string };

      if (!response.ok || !("createdCategories" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Falha ao restaurar categorias padrao.");
      }

      setFeedback({
        type: "success",
        message: `Padroes aplicados: ${data.createdCategories} categorias e ${data.createdRules} regras novas.`
      });
      await load();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Falha ao restaurar categorias padrao."
      });
    } finally {
      setRestoringDefaults(false);
    }
  };

  return (
    <PageShell title="Categorias" subtitle="Categorias manuais e automacoes por regra">
      {loading ? (
        <Skeleton className="h-[420px]" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1 sm:flex-none"
              variant={tab === "categories" ? "default" : "outline"}
              onClick={() => setTab("categories")}
            >
              Categorias
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              variant={tab === "automations" ? "default" : "outline"}
              onClick={() => setTab("automations")}
            >
              Automacoes
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              variant="outline"
              onClick={() => void restoreDefaults()}
              disabled={restoringDefaults}
            >
              {restoringDefaults ? "Aplicando..." : "Restaurar padrao"}
            </Button>
          </div>

          {feedback ? (
            <div
              className={
                feedback.type === "success"
                  ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
              }
            >
              {feedback.message}
            </div>
          ) : null}

          {tab === "categories" ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Nova categoria</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                  <Input
                    placeholder="Nome"
                    value={categoryForm.name}
                    onChange={(event) =>
                      setCategoryForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                  <Input
                    type="color"
                    value={categoryForm.color}
                    onChange={(event) =>
                      setCategoryForm((prev) => ({ ...prev, color: event.target.value }))
                    }
                  />
                  <Input
                    placeholder="Icone"
                    value={categoryForm.icon}
                    onChange={(event) =>
                      setCategoryForm((prev) => ({ ...prev, icon: event.target.value }))
                    }
                  />
                  <Button onClick={() => void createCategory()} className="w-full md:w-auto">
                    Salvar
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lista de categorias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="font-medium">{category.name}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => void removeCategory(category.id)}>
                          Excluir
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Nova regra</CardTitle>
                  <Button variant="outline" onClick={() => void reapplyRules()}>
                    Reaplicar regras
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                  <Input
                    placeholder="Nome"
                    value={ruleForm.name}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  <Input
                    placeholder="Padrao (contains/regex)"
                    value={ruleForm.pattern}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, pattern: event.target.value }))}
                  />
                  <Select
                    value={ruleForm.matchType}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, matchType: event.target.value }))}
                  >
                    <option value="contains">Contains</option>
                    <option value="regex">Regex</option>
                  </Select>
                  <Input
                    placeholder="Prioridade"
                    type="number"
                    value={ruleForm.priority}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, priority: event.target.value }))}
                  />

                  <Select
                    value={ruleForm.categoryId}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={ruleForm.accountId}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, accountId: event.target.value }))}
                  >
                    <option value="">Qualquer conta</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>

                  <Input
                    type="number"
                    placeholder="Min valor"
                    value={ruleForm.minAmount}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, minAmount: event.target.value }))}
                  />
                  <Input
                    type="number"
                    placeholder="Max valor"
                    value={ruleForm.maxAmount}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, maxAmount: event.target.value }))}
                  />
                  <Button onClick={() => void createRule()} className="w-full md:w-auto">
                    Salvar regra
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Regras cadastradas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{rule.name}</span>
                            <Badge variant={rule.enabled ? "default" : "secondary"}>
                              {rule.enabled ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {rule.matchType} • {rule.pattern} • categoria {rule.category?.name}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => void toggleRule(rule)}>
                            {rule.enabled ? "Desativar" : "Ativar"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void removeRule(rule.id)}>
                            Excluir
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}


