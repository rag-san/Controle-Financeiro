"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfYear, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Landmark, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { AccountDTO } from "@/lib/types";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";

type AccountRecord = AccountDTO & { currentBalance: number };
type NetWorthEntry = {
  id: string;
  type: "asset" | "debt";
  name: string;
  value: number;
  date: string;
  group: string | null;
};

type FormState = {
  type: "asset" | "debt";
  name: string;
  value: string;
  date: string;
  group: string;
};

type HistoryPoint = {
  date: string;
  label: string;
  netWorth: number;
};

const RANGE_OPTIONS = ["3M", "YTD", "1Y", "ALL"] as const;

function defaultForm(): FormState {
  return {
    type: "asset",
    name: "",
    value: "",
    date: format(new Date(), "yyyy-MM-dd"),
    group: ""
  };
}

function accountAssets(accounts: AccountRecord[]): number {
  return Number(accounts.filter((item) => item.currentBalance > 0).reduce((sum, item) => sum + item.currentBalance, 0).toFixed(2));
}

function accountDebts(accounts: AccountRecord[]): number {
  return Number(
    accounts
      .filter((item) => item.currentBalance < 0)
      .reduce((sum, item) => sum + Math.abs(item.currentBalance), 0)
      .toFixed(2)
  );
}

function filterHistory(points: HistoryPoint[], range: (typeof RANGE_OPTIONS)[number]): HistoryPoint[] {
  if (range === "ALL" || points.length <= 1) return points;
  const latest = new Date(`${points[points.length - 1].date}T12:00:00`);
  const threshold =
    range === "3M" ? subMonths(latest, 2) : range === "YTD" ? startOfYear(latest) : subMonths(latest, 11);
  return points.filter((point) => new Date(`${point.date}T12:00:00`).getTime() >= threshold.getTime());
}

function formFromEntry(entry: NetWorthEntry | null): FormState {
  if (!entry) return defaultForm();
  return {
    type: entry.type,
    name: entry.name,
    value: String(entry.value),
    date: entry.date.slice(0, 10),
    group: entry.group ?? ""
  };
}

function buildHistory(entries: NetWorthEntry[], currentNetWorth: number): HistoryPoint[] {
  const byDate = new Map<string, number>();

  for (const entry of entries) {
    const key = entry.date.slice(0, 10);
    const current = byDate.get(key) ?? 0;
    byDate.set(key, current + (entry.type === "asset" ? entry.value : -entry.value));
  }

  const points = [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, netWorth]) => ({
      date,
      label: format(new Date(`${date}T12:00:00`), "MMM/yy", { locale: ptBR }),
      netWorth: Number(netWorth.toFixed(2))
    }));

  const today = format(new Date(), "yyyy-MM-dd");
  const last = points[points.length - 1];
  if (!last || last.date !== today || last.netWorth !== currentNetWorth) {
    points.push({
      date: today,
      label: format(new Date(`${today}T12:00:00`), "MMM/yy", { locale: ptBR }),
      netWorth: currentNetWorth
    });
  }

  return points;
}

function groupAccountLabel(account: AccountRecord): string {
  if (account.type === "investment") return "Investimentos";
  if (account.type === "credit") return "Cartões";
  if (account.type === "cash") return "Caixa";
  return "Contas";
}

function EntryModal({
  open,
  editing,
  form,
  busy,
  onClose,
  onChange,
  onSubmit
}: {
  open: boolean;
  editing: NetWorthEntry | null;
  form: FormState;
  busy: boolean;
  onClose: () => void;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  const isValid = form.name.trim().length >= 2 && Number(form.value) > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-[1.75rem] border border-border bg-card shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {editing ? "Editar patrimônio" : "Novo patrimônio"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Itens manuais fora das contas bancárias.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            Fechar
          </button>
        </div>
        <div className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-2 gap-3">
            {(["asset", "debt"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ type })}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
                  form.type === type
                    ? type === "asset"
                      ? "border-success bg-success text-success-foreground"
                      : "border-error bg-error text-error-foreground"
                    : "border-border bg-secondary text-foreground"
                )}
              >
                {type === "asset" ? "Ativo" : "Dívida"}
              </button>
            ))}
          </div>
          <input value={form.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Nome" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
          <div className="grid gap-4 sm:grid-cols-2">
            <input type="number" min="0" step="0.01" value={form.value} onChange={(event) => onChange({ value: event.target.value })} placeholder="Valor" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
            <input type="date" value={form.date} onChange={(event) => onChange({ date: event.target.value })} className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
          </div>
          <input value={form.group} onChange={(event) => onChange({ group: event.target.value })} placeholder="Grupo opcional" className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none" />
        </div>
        <div className="flex gap-3 border-t border-border px-6 py-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground">
            Cancelar
          </button>
          <button type="button" disabled={!isValid || busy} onClick={onSubmit} className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Salvando..." : editing ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NetWorthPage(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [entries, setEntries] = useState<NetWorthEntry[]>([]);
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]>("1Y");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NetWorthEntry | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError("");
    try {
      const [accountsPayload, entriesPayload] = await Promise.all([
        fetchJsonOrThrow<AccountRecord[]>("/api/accounts"),
        fetchJsonOrThrow<NetWorthEntry[]>("/api/net-worth")
      ]);
      setAccounts(accountsPayload);
      setEntries(entriesPayload);
    } catch (loadError) {
      setAccounts([]);
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar patrimônio.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const latestEntryDate = useMemo(
    () => [...entries].map((entry) => entry.date).sort((left, right) => right.localeCompare(left))[0] ?? null,
    [entries]
  );

  const latestEntries = useMemo(
    () => entries.filter((entry) => entry.date === latestEntryDate),
    [entries, latestEntryDate]
  );

  const manualAssets = useMemo(
    () => Number(latestEntries.filter((item) => item.type === "asset").reduce((sum, item) => sum + item.value, 0).toFixed(2)),
    [latestEntries]
  );
  const manualDebts = useMemo(
    () => Number(latestEntries.filter((item) => item.type === "debt").reduce((sum, item) => sum + item.value, 0).toFixed(2)),
    [latestEntries]
  );

  const totalAssets = useMemo(() => Number((accountAssets(accounts) + manualAssets).toFixed(2)), [accounts, manualAssets]);
  const totalDebts = useMemo(() => Number((accountDebts(accounts) + manualDebts).toFixed(2)), [accounts, manualDebts]);
  const totalNetWorth = useMemo(() => Number((totalAssets - totalDebts).toFixed(2)), [totalAssets, totalDebts]);
  const history = useMemo(() => filterHistory(buildHistory(entries, totalNetWorth), range), [entries, totalNetWorth, range]);

  const allocation = useMemo(() => {
    const source = new Map<string, number>();
    for (const account of accounts.filter((item) => item.currentBalance > 0)) {
      const label = groupAccountLabel(account);
      source.set(label, (source.get(label) ?? 0) + account.currentBalance);
    }
    for (const entry of latestEntries.filter((item) => item.type === "asset")) {
      const label = entry.group?.trim() || entry.name;
      source.set(label, (source.get(label) ?? 0) + entry.value);
    }

    const palette = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--error))"];
    return [...source.entries()].map(([name, value], index) => ({
      name,
      value: Number(value.toFixed(2)),
      color: palette[index % palette.length]
    }));
  }, [accounts, latestEntries]);

  const openCreate = (): void => {
    setEditing(null);
    setForm(defaultForm());
    setModalOpen(true);
  };

  const openEdit = (entry: NetWorthEntry): void => {
    setEditing(entry);
    setForm(formFromEntry(entry));
    setModalOpen(true);
  };

  const saveEntry = async (): Promise<void> => {
    const numericValue = Number(form.value);
    if (form.name.trim().length < 2 || !Number.isFinite(numericValue) || numericValue <= 0) return;

    setSubmitting(true);
    try {
      const payload = {
        type: form.type,
        name: form.name.trim(),
        value: numericValue,
        date: form.date,
        group: form.group.trim() || null
      };

      if (editing) {
        await fetchJsonOrThrow(`/api/net-worth/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Patrimônio atualizado.");
      } else {
        await fetchJsonOrThrow("/api/net-worth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Patrimônio registrado.");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(defaultForm());
      notifyFinanceDataChanged();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Falha ao salvar patrimônio.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = async (entry: NetWorthEntry): Promise<void> => {
    if (!window.confirm(`Excluir "${entry.name}"?`)) return;

    try {
      await fetchJsonOrThrow(`/api/net-worth/${entry.id}`, { method: "DELETE" });
      toast.success("Registro removido.");
      notifyFinanceDataChanged();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Falha ao excluir registro.");
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (error && accounts.length === 0 && entries.length === 0) {
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Patrimônio</h1>
            <p className="mt-1 text-sm text-muted-foreground">Consolidação entre contas e ativos ou dívidas manuais.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <Plus size={16} />
            Novo lançamento
          </button>
        </header>

        {accounts.length === 0 && entries.length === 0 ? (
          <div className="glass-card">
            <EmptyState
              icon={Wallet}
              title="Nenhum patrimônio registrado"
              description="Adicione contas ou registre bens e dívidas manuais para acompanhar sua evolução."
              actionLabel="Adicionar lançamento"
              onAction={openCreate}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.2fr]">
              <div className="glass-card p-6 sm:p-8">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Alocação dos ativos</h2>
                <div className={cn("mt-3 geist-mono text-4xl font-semibold tracking-tight", totalNetWorth >= 0 ? "text-foreground" : "text-error")}>
                  {formatCurrency(Math.abs(totalNetWorth))}
                </div>
                {allocation.length === 0 ? (
                  <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
                    Os ativos aparecem aqui quando houver saldo positivo ou lançamentos manuais.
                  </div>
                ) : (
                  <>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={60} outerRadius={86} paddingAngle={4} stroke="none">
                            {allocation.map((item) => (
                              <Cell key={item.name} fill={item.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      {allocation.map((item) => (
                        <div key={item.name} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                          </div>
                          <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="glass-card p-6 sm:p-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ativos</div>
                      <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(totalAssets)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Dívidas</div>
                      <div className="mt-2 geist-mono text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(totalDebts)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Último registro</div>
                      <div className="mt-2 text-sm font-medium text-foreground">
                        {latestEntryDate ? format(new Date(latestEntryDate), "dd 'de' MMM yyyy", { locale: ptBR }) : "Sem histórico manual"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {RANGE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRange(option)}
                        className={cn("rounded-full px-3 py-1.5 text-xs font-medium", range === option ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wealth-gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => (value === 0 ? "0" : `${Number(value) / 1000}k`)} width={42} />
                      <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0))} />
                      <Area type="monotone" dataKey="netWorth" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#wealth-gradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="glass-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Itens manuais</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{entries.length} registros históricos</p>
                  </div>
                  <Wallet size={16} className="text-muted-foreground" />
                </div>
                {entries.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum item manual cadastrado.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...entries].sort((left, right) => right.date.localeCompare(left.date)).map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", entry.type === "asset" ? "bg-success/10 text-success" : "bg-error/10 text-error")}>
                              {entry.type === "asset" ? "Ativo" : "Dívida"}
                            </span>
                            <span className="text-sm font-semibold text-foreground">{entry.name}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {entry.group || "Sem grupo"} • {format(new Date(entry.date), "dd/MM/yyyy")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(entry.value)}</span>
                          <button type="button" onClick={() => openEdit(entry)} className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground">
                            Editar
                          </button>
                          <button type="button" onClick={() => void deleteEntry(entry)} className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs font-medium text-error">
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Contas incluídas</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Saldos atuais usados nos indicadores</p>
                  </div>
                  <Landmark size={16} className="text-muted-foreground" />
                </div>
                {accounts.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma conta disponível.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {accounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between gap-4 px-5 py-4">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{account.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{groupAccountLabel(account)} • {account.institution || "manual"}</div>
                        </div>
                        <span className="geist-mono text-sm font-semibold text-foreground">{formatCurrency(Math.abs(account.currentBalance))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error ? <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div> : null}
          </>
        )}
      </div>

      <EntryModal
        open={modalOpen}
        editing={editing}
        form={form}
        busy={submitting}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setForm(defaultForm());
        }}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={() => void saveEntry()}
      />
    </>
  );
}
