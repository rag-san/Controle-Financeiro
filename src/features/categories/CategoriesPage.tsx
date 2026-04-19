"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChevronDown, ChevronRight, Edit3, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CategoryDTO } from "@/lib/types";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { CATEGORY_COLOR_SWATCHES } from "@/src/features/categories/categoryColors";
import { MonthSelector } from "@/src/features/shared/MonthSelector";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";

type CategoryRecord = CategoryDTO & {
  _count?: {
    transactions: number;
    children: number;
  };
};

type CategoriesMetrics = {
  view: "categories";
  month: string;
  aggregates: {
    totalSpent: number;
    list: Array<{
      categoryId: string | null;
      name: string;
      parentId: string | null;
      color: string;
      value: number;
      share: number;
    }>;
    groups: Array<{
      id: string;
      name: string;
      color: string;
      total: number;
      children: Array<{
        categoryId: string | null;
        name: string;
        color: string;
        value: number;
        share: number;
      }>;
    }>;
  };
};

type FormState = {
  name: string;
  color: string;
  parentId: string;
};

function buildDefaultForm(): FormState {
  return {
    name: "",
    color: CATEGORY_COLOR_SWATCHES[0],
    parentId: ""
  };
}

function formFromCategory(category: CategoryRecord | null): FormState {
  if (!category) return buildDefaultForm();
  return {
    name: category.name,
    color: category.color,
    parentId: category.parentId ?? ""
  };
}

function keyFromCategory(name: string, categoryId: string | null): string {
  return categoryId ?? `uncategorized-${name}`;
}

function CategoryModal({
  open,
  editing,
  roots,
  form,
  busy,
  onClose,
  onChange,
  onSubmit
}: {
  open: boolean;
  editing: CategoryRecord | null;
  roots: CategoryRecord[];
  form: FormState;
  busy: boolean;
  onClose: () => void;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  const isValid = form.name.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-[1.75rem] border border-border bg-card shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{editing ? "Editar categoria" : "Nova categoria"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">As categorias se conectam direto aos relatórios oficiais.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            Fechar
          </button>
        </div>
        <div className="space-y-5 px-6 py-6">
          <input value={form.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Nome da categoria" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
          <select value={form.parentId} onChange={(event) => onChange({ parentId: event.target.value })} className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none">
            <option value="">Categoria principal</option>
            {roots.filter((root) => !editing || root.id !== editing.id).map((root) => (
              <option key={root.id} value={root.id}>{root.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-6 gap-3">
            {CATEGORY_COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange({ color })}
                className={cn("h-10 rounded-2xl border-2 transition-transform", form.color === color ? "scale-105 border-foreground" : "border-transparent")}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-3 border-t border-border px-6 py-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground">
            Cancelar
          </button>
          <button type="button" disabled={!isValid || busy} onClick={onSubmit} className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Salvando..." : editing ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CategoriesPage(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<CategoriesMetrics | null>(null);
  const [previousMetrics, setPreviousMetrics] = useState<CategoriesMetrics | null>(null);
  const [historyMetrics, setHistoryMetrics] = useState<CategoriesMetrics[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [form, setForm] = useState<FormState>(buildDefaultForm());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError("");
    const months = Array.from({ length: 6 }, (_, index) => subMonths(selectedMonth, 5 - index));
    try {
      const [categoriesPayload, ...metricsPayloads] = await Promise.all([
        fetchJsonOrThrow<CategoryRecord[]>("/api/categories"),
        ...months.map((date) =>
          fetchJsonOrThrow<CategoriesMetrics>(`/api/metrics/official?view=categories&month=${format(date, "yyyy-MM")}`)
        ),
        fetchJsonOrThrow<CategoriesMetrics>(
          `/api/metrics/official?view=categories&month=${format(subMonths(selectedMonth, 1), "yyyy-MM")}`
        )
      ]);

      const history = metricsPayloads.slice(0, 6);
      const previous = metricsPayloads[6] ?? null;
      setCategories(categoriesPayload);
      setHistoryMetrics(history);
      setCurrentMetrics(history[history.length - 1] ?? null);
      setPreviousMetrics(previous);
    } catch (loadError) {
      setCategories([]);
      setCurrentMetrics(null);
      setPreviousMetrics(null);
      setHistoryMetrics([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar categorias.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDataChanged = (): void => {
      void load();
    };
    window.addEventListener("finance-data-changed", onDataChanged);
    return () => window.removeEventListener("finance-data-changed", onDataChanged);
  }, [load]);

  const roots = useMemo(() => categories.filter((category) => !category.parentId), [categories]);

  const topKeys = useMemo(
    () => (currentMetrics?.aggregates.list ?? []).slice(0, 4).map((item) => keyFromCategory(item.name, item.categoryId)),
    [currentMetrics]
  );

  const historyRows = useMemo(
    () =>
      historyMetrics.map((metric) => {
        const row: Record<string, string | number> = {
          month: format(new Date(`${metric.month}-01T12:00:00`), "MMM", { locale: ptBR })
        };
        for (const key of topKeys) {
          const found = metric.aggregates.list.find((item) => keyFromCategory(item.name, item.categoryId) === key);
          row[key] = found?.value ?? 0;
        }
        return row;
      }),
    [historyMetrics, topKeys]
  );

  const comparisonRows = useMemo(() => {
    const keys = new Set<string>();
    for (const item of (currentMetrics?.aggregates.list ?? []).slice(0, 6)) keys.add(keyFromCategory(item.name, item.categoryId));
    for (const item of (previousMetrics?.aggregates.list ?? []).slice(0, 6)) keys.add(keyFromCategory(item.name, item.categoryId));
    return [...keys].map((key) => {
      const current = currentMetrics?.aggregates.list.find((item) => keyFromCategory(item.name, item.categoryId) === key);
      const previous = previousMetrics?.aggregates.list.find((item) => keyFromCategory(item.name, item.categoryId) === key);
      return {
        name: current?.name ?? previous?.name ?? "Sem categoria",
        current: current?.value ?? 0,
        previous: previous?.value ?? 0
      };
    }).sort((left, right) => right.current - left.current);
  }, [currentMetrics, previousMetrics]);

  const saveCategory = async (): Promise<void> => {
    if (form.name.trim().length < 2) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        parentId: form.parentId || null
      };

      if (editing) {
        await fetchJsonOrThrow(`/api/categories/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Categoria atualizada.");
      } else {
        await fetchJsonOrThrow("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Categoria criada.");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(buildDefaultForm());
      notifyFinanceDataChanged();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Falha ao salvar categoria.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCategory = async (category: CategoryRecord): Promise<void> => {
    if (!window.confirm(`Excluir "${category.name}"?`)) return;
    try {
      await fetchJsonOrThrow(`/api/categories/${category.id}`, { method: "DELETE" });
      toast.success("Categoria removida.");
      notifyFinanceDataChanged();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Falha ao excluir categoria.");
    }
  };

  if (loading) return <PageSkeleton />;

  if (error && !currentMetrics) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="mb-4 text-sm text-error">{error}</p>
        <button onClick={() => { setLoading(true); void load(); }} className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
          Tentar novamente
        </button>
      </div>
    );
  }

  const selectedMonthLabel = format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Categorias</h1>
            <p className="mt-1 text-sm text-muted-foreground">Estrutura e consumo de {selectedMonthLabel}.</p>
          </div>
          <div className="flex items-center gap-3">
            <MonthSelector currentDate={selectedMonth} onChange={setSelectedMonth} />
            <button type="button" onClick={() => { setEditing(null); setForm(buildDefaultForm()); setModalOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Plus size={16} />
              Nova categoria
            </button>
          </div>
        </header>

        {!currentMetrics ? (
          <div className="glass-card">
            <EmptyState icon={Tag} title="Sem dados categorizados" description="Quando suas despesas tiverem categoria, os painéis desta tela serão preenchidos." />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="glass-card p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Evolução por categoria</h2>
                    <div className="mt-2 geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(currentMetrics.aggregates.totalSpent)}</div>
                  </div>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historyRows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis hide />
                      <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0))} />
                      {topKeys.map((key, index) => {
                        const ref = currentMetrics.aggregates.list.find((item) => keyFromCategory(item.name, item.categoryId) === key);
                        return <Area key={key} type="monotone" dataKey={key} name={ref?.name ?? key} stackId="1" stroke={ref?.color ?? CATEGORY_COLOR_SWATCHES[index]} fill={ref?.color ?? CATEGORY_COLOR_SWATCHES[index]} fillOpacity={0.18} />;
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Comparativo mensal</h2>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonRows} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={100} />
                      <Tooltip formatter={(value: number | string | undefined, name?: string) => [formatCurrency(Number(value ?? 0)), name === "current" ? "Atual" : "Anterior"]} />
                      <Bar dataKey="current" name="Atual" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={12} />
                      <Bar dataKey="previous" name="Anterior" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="glass-card overflow-hidden">
              <div className="border-b border-border bg-secondary/60 px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">Estrutura final de categorias</h2>
                <p className="mt-1 text-xs text-muted-foreground">Sem duplicação entre layout, visual e dados oficiais.</p>
              </div>
              {currentMetrics.aggregates.groups.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma categoria ativa neste mês.</div>
              ) : (
                <div className="divide-y divide-border">
                  {currentMetrics.aggregates.groups.map((group) => {
                    const groupCategory = categories.find((item) => item.id === group.id);
                    const isExpanded = expanded[group.id] ?? true;
                    return (
                      <div key={group.id}>
                        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <button type="button" onClick={() => setExpanded((current) => ({ ...current, [group.id]: !isExpanded }))} className="flex items-center gap-3 text-left">
                            <span className="rounded-full p-1 text-muted-foreground">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                            <div>
                              <div className="text-sm font-semibold text-foreground">{group.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {groupCategory?._count?.children ?? 0} subcategorias • {groupCategory?._count?.transactions ?? 0} transações
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(group.total)}</span>
                            {groupCategory ? (
                              <>
                                <button type="button" onClick={() => { setEditing(groupCategory); setForm(formFromCategory(groupCategory)); setModalOpen(true); }} className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground">
                                  <Edit3 size={14} />
                                </button>
                                <button type="button" onClick={() => void deleteCategory(groupCategory)} className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs font-medium text-error">
                                  <Trash2 size={14} />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {isExpanded ? (
                          <div className="space-y-3 px-5 pb-5">
                            {group.children.map((child) => (
                              <div key={`${group.id}-${keyFromCategory(child.name, child.categoryId)}`} className="rounded-2xl border border-border bg-secondary/40 px-4 py-3">
                                <div className="mb-2 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: child.color }} />
                                    <span className="text-sm font-medium text-foreground">{child.name}</span>
                                  </div>
                                  <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(child.value)}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(child.share, 100)}%`, backgroundColor: child.color }} />
                                  </div>
                                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{child.share.toFixed(1)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {error ? <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div> : null}
      </div>

      <CategoryModal
        open={modalOpen}
        editing={editing}
        roots={roots}
        form={form}
        busy={submitting}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setForm(buildDefaultForm());
        }}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={() => void saveCategory()}
      />
    </>
  );
}
