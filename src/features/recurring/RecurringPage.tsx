"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, CheckCircle2, Edit3, Plus, RefreshCw, Repeat2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CategoryDTO } from "@/lib/types";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";

type RecurringItem = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  categoryId: string | null;
  status: "active" | "inactive";
  lastPaidAt: string | null;
  category?: CategoryDTO | null;
};

type BootstrapPayload = {
  items: RecurringItem[];
  categories: CategoryDTO[];
};

type FormState = {
  name: string;
  amount: string;
  dueDay: string;
  categoryId: string;
  status: "active" | "inactive";
  lastPaidAt: string;
};

function defaultForm(): FormState {
  return {
    name: "",
    amount: "",
    dueDay: "5",
    categoryId: "",
    status: "active",
    lastPaidAt: ""
  };
}

function formFromItem(item: RecurringItem | null): FormState {
  if (!item) return defaultForm();
  return {
    name: item.name,
    amount: String(item.amount),
    dueDay: String(item.dueDay),
    categoryId: item.categoryId ?? "",
    status: item.status,
    lastPaidAt: item.lastPaidAt ? item.lastPaidAt.slice(0, 10) : ""
  };
}

function RecurringModal({
  open,
  editing,
  categories,
  form,
  busy,
  onClose,
  onChange,
  onSubmit
}: {
  open: boolean;
  editing: RecurringItem | null;
  categories: CategoryDTO[];
  form: FormState;
  busy: boolean;
  onClose: () => void;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  const isValid = form.name.trim().length >= 2 && Number(form.amount) > 0 && Number(form.dueDay) >= 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-[1.75rem] border border-border bg-card shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{editing ? "Editar recorrência" : "Nova recorrência"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Agendamentos mensais com status real de pagamento.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            Fechar
          </button>
        </div>
        <div className="space-y-5 px-6 py-6">
          <input value={form.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Descrição" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
          <div className="grid gap-4 sm:grid-cols-2">
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => onChange({ amount: event.target.value })} placeholder="Valor" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
            <input type="number" min="1" max="31" value={form.dueDay} onChange={(event) => onChange({ dueDay: event.target.value })} placeholder="Dia do vencimento" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <select value={form.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })} className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none">
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <select value={form.status} onChange={(event) => onChange({ status: event.target.value as FormState["status"] })} className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none">
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
            </select>
          </div>
          <input type="date" value={form.lastPaidAt} onChange={(event) => onChange({ lastPaidAt: event.target.value })} className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
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

export function RecurringPage(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError("");
    try {
      const payload = await fetchJsonOrThrow<BootstrapPayload>("/api/recurring/bootstrap");
      setItems(payload.items);
      setCategories(payload.categories);
    } catch (loadError) {
      setItems([]);
      setCategories([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar recorrências.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDataChanged = (): void => {
      setRefreshing(true);
      void load();
    };
    window.addEventListener("finance-data-changed", onDataChanged);
    return () => window.removeEventListener("finance-data-changed", onDataChanged);
  }, [load]);

  const activeItems = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const paidThisMonth = useMemo(
    () => activeItems.filter((item) => item.lastPaidAt && isSameMonth(new Date(item.lastPaidAt), new Date())),
    [activeItems]
  );
  const totalActive = useMemo(() => Number(activeItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2)), [activeItems]);
  const totalPaid = useMemo(() => Number(paidThisMonth.reduce((sum, item) => sum + item.amount, 0).toFixed(2)), [paidThisMonth]);
  const totalPending = useMemo(() => Number((totalActive - totalPaid).toFixed(2)), [totalActive, totalPaid]);
  const progress = totalActive > 0 ? Math.min(100, Math.round((totalPaid / totalActive) * 100)) : 0;

  const groupedItems = useMemo(
    () =>
      [...items].sort((left, right) => left.dueDay - right.dueDay || left.name.localeCompare(right.name)).reduce<Map<number, RecurringItem[]>>((acc, item) => {
        acc.set(item.dueDay, [...(acc.get(item.dueDay) ?? []), item]);
        return acc;
      }, new Map()),
    [items]
  );

  const saveItem = async (): Promise<void> => {
    const numericAmount = Number(form.amount);
    const numericDueDay = Number(form.dueDay);
    if (form.name.trim().length < 2 || !Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isFinite(numericDueDay)) return;

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount: numericAmount,
        dueDay: numericDueDay,
        categoryId: form.categoryId || null,
        status: form.status,
        lastPaidAt: form.lastPaidAt || null
      };

      if (editing) {
        await fetchJsonOrThrow(`/api/recurring/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Recorrência atualizada.");
      } else {
        await fetchJsonOrThrow("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Recorrência criada.");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(defaultForm());
      notifyFinanceDataChanged();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Falha ao salvar recorrência.");
    } finally {
      setSubmitting(false);
    }
  };

  const patchItem = async (item: RecurringItem, patch: Record<string, unknown>, successMessage: string): Promise<void> => {
    try {
      await fetchJsonOrThrow(`/api/recurring/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      toast.success(successMessage);
      notifyFinanceDataChanged();
    } catch (patchError) {
      toast.error(patchError instanceof Error ? patchError.message : "Falha ao atualizar recorrência.");
    }
  };

  const deleteItem = async (item: RecurringItem): Promise<void> => {
    if (!window.confirm(`Excluir "${item.name}"?`)) return;
    try {
      await fetchJsonOrThrow(`/api/recurring/${item.id}`, { method: "DELETE" });
      toast.success("Recorrência removida.");
      notifyFinanceDataChanged();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Falha ao excluir recorrência.");
    }
  };

  if (loading) return <PageSkeleton />;

  if (error && items.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="mb-4 text-sm text-error">{error}</p>
        <button onClick={() => { setLoading(true); void load(); }} className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Recorrentes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Agenda mensal de compromissos fixos com status real de pagamento.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setRefreshing(true); void load(); }} className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground">
              <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
              Atualizar
            </button>
            <button type="button" onClick={() => { setEditing(null); setForm(defaultForm()); setModalOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Plus size={16} />
              Criar recorrência
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="glass-card">
            <EmptyState
              icon={Repeat2}
              title="Nenhuma recorrência cadastrada"
              description="Adicione despesas mensais para acompanhar o que já foi pago e o que ainda falta sair do caixa."
              actionLabel="Nova recorrência"
              onAction={() => { setEditing(null); setForm(defaultForm()); setModalOpen(true); }}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.2fr]">
              <div className="glass-card p-6 sm:p-8">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total ativo</div>
                    <div className="mt-2 geist-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(totalActive)}</div>
                    <p className="mt-2 text-sm text-muted-foreground">{activeItems.length} itens ativos neste mês</p>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-[10px] border-muted">
                      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${progress}%, transparent 0)` }} />
                      <div className="absolute inset-2 rounded-full bg-card" />
                      <span className="relative geist-mono text-xl font-semibold text-foreground">{progress}%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pago</div>
                    <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">{formatCurrency(totalPaid)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pendente</div>
                    <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">{formatCurrency(totalPending)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-4">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Inativas</div>
                    <div className="mt-2 geist-mono text-xl font-semibold tracking-tight text-foreground">{items.filter((item) => item.status === "inactive").length}</div>
                  </div>
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <div className="border-b border-border bg-secondary/60 px-5 py-4">
                  <h2 className="text-sm font-semibold text-foreground">Agenda do mês</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}</p>
                </div>
                <div className="divide-y divide-border">
                  {[...groupedItems.entries()].map(([dueDay, dueItems]) => (
                    <div key={dueDay} className="px-5 py-4">
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        <CalendarClock size={14} />
                        Dia {String(dueDay).padStart(2, "0")}
                      </div>
                      <div className="space-y-3">
                        {dueItems.map((item) => {
                          const isPaid = Boolean(item.lastPaidAt && isSameMonth(new Date(item.lastPaidAt), new Date()));
                          return (
                            <div key={item.id} className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", item.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                                      {item.status === "active" ? "Ativa" : "Inativa"}
                                    </span>
                                    {isPaid ? <CheckCircle2 size={15} className="text-success" /> : null}
                                    <span className="text-sm font-semibold text-foreground">{item.name}</span>
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {item.category?.name ?? "Sem categoria"}
                                    {item.lastPaidAt ? ` • pago em ${format(new Date(item.lastPaidAt), "dd/MM/yyyy")}` : " • aguardando pagamento"}
                                  </div>
                                </div>
                                <div className="flex flex-col items-start gap-3 sm:items-end">
                                  <div className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(item.amount)}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {!isPaid && item.status === "active" ? (
                                      <button type="button" onClick={() => void patchItem(item, { lastPaidAt: format(new Date(), "yyyy-MM-dd") }, "Pagamento registrado.")} className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                                        Marcar pago
                                      </button>
                                    ) : null}
                                    <button type="button" onClick={() => void patchItem(item, { status: item.status === "active" ? "inactive" : "active" }, item.status === "active" ? "Recorrência pausada." : "Recorrência reativada.")} className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground">
                                      {item.status === "active" ? "Pausar" : "Ativar"}
                                    </button>
                                    <button type="button" onClick={() => { setEditing(item); setForm(formFromItem(item)); setModalOpen(true); }} className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground">
                                      <Edit3 size={14} />
                                    </button>
                                    <button type="button" onClick={() => void deleteItem(item)} className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs font-medium text-error">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {error ? <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div> : null}
      </div>

      <RecurringModal
        open={modalOpen}
        editing={editing}
        categories={categories}
        form={form}
        busy={submitting}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setForm(defaultForm());
        }}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={() => void saveItem()}
      />
    </>
  );
}
