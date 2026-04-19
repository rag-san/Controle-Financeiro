"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfMonth, startOfYear, subMonths } from "date-fns";
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
import { CreditCard, Edit3, Landmark, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { AccountDTO } from "@/lib/types";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";

type AccountRecord = AccountDTO & {
  userId: string;
  createdAt: string;
  updatedAt: string;
  currentBalance: number;
};

type NetWorthEntry = {
  id: string;
  userId: string;
  type: "asset" | "debt";
  name: string;
  value: number;
  date: string;
  group: string | null;
  createdAt: string;
  updatedAt: string;
};

type HistoryPoint = {
  date: string;
  label: string;
  assets: number;
  debts: number;
};

type AccountFormState = {
  name: string;
  type: AccountDTO["type"];
  institution: string;
  currency: string;
  parentAccountId: string;
};

const RANGE_OPTIONS = ["1M", "3M", "YTD", "1Y", "ALL"] as const;

const DEFAULT_FORM: AccountFormState = {
  name: "",
  type: "checking",
  institution: "",
  currency: "BRL",
  parentAccountId: ""
};

function parseDateLabel(value: string): string {
  return format(new Date(`${value}T12:00:00`), "dd/MM", { locale: ptBR });
}

function formatConfirmedBalanceDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function resolveAccountAssets(accounts: AccountRecord[]): number {
  return Number(
    accounts
      .filter((account) => account.currentBalance > 0)
      .reduce((sum, account) => sum + account.currentBalance, 0)
      .toFixed(2)
  );
}

function resolveAccountDebts(accounts: AccountRecord[]): number {
  return Number(
    accounts
      .filter((account) => account.currentBalance < 0)
      .reduce((sum, account) => sum + Math.abs(account.currentBalance), 0)
      .toFixed(2)
  );
}

function buildHistory(entries: NetWorthEntry[], accounts: AccountRecord[]): HistoryPoint[] {
  const snapshots = new Map<string, { assets: number; debts: number }>();

  for (const entry of entries) {
    const key = entry.date.slice(0, 10);
    const current = snapshots.get(key) ?? { assets: 0, debts: 0 };
    if (entry.type === "asset") current.assets += entry.value;
    else current.debts += entry.value;
    snapshots.set(key, current);
  }

  const points = [...snapshots.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({
      date,
      label: parseDateLabel(date),
      assets: Number(value.assets.toFixed(2)),
      debts: Number(value.debts.toFixed(2))
    }));

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const currentPoint = {
    date: todayKey,
    label: parseDateLabel(todayKey),
    assets: resolveAccountAssets(accounts),
    debts: resolveAccountDebts(accounts)
  };

  const lastPoint = points[points.length - 1];
  if (
    !lastPoint ||
    lastPoint.date !== currentPoint.date ||
    lastPoint.assets !== currentPoint.assets ||
    lastPoint.debts !== currentPoint.debts
  ) {
    points.push(currentPoint);
  }

  if (points.length === 0) {
    return [currentPoint];
  }

  return points;
}

function filterHistory(points: HistoryPoint[], range: (typeof RANGE_OPTIONS)[number]): HistoryPoint[] {
  if (range === "ALL" || points.length <= 1) return points;

  const latest = new Date(`${points[points.length - 1].date}T12:00:00`);
  let threshold = latest;

  if (range === "1M") threshold = startOfMonth(subMonths(latest, 0));
  if (range === "3M") threshold = startOfMonth(subMonths(latest, 2));
  if (range === "YTD") threshold = startOfYear(latest);
  if (range === "1Y") threshold = startOfMonth(subMonths(latest, 11));

  return points.filter((point) => new Date(`${point.date}T12:00:00`).getTime() >= threshold.getTime());
}

function accountTypeLabel(type: AccountDTO["type"]): string {
  if (type === "checking") return "Conta bancária";
  if (type === "credit") return "Cartão de crédito";
  if (type === "cash") return "Carteira";
  return "Investimento";
}

function groupTitle(type: "credit" | "bank" | "wealth"): string {
  if (type === "credit") return "Cartões de crédito";
  if (type === "bank") return "Contas e caixa";
  return "Investimentos";
}

function groupIcon(type: "credit" | "bank" | "wealth"): typeof CreditCard {
  if (type === "credit") return CreditCard;
  if (type === "bank") return Landmark;
  return Wallet;
}

function openFormFromAccount(account: AccountRecord | null): AccountFormState {
  if (!account) return DEFAULT_FORM;
  return {
    name: account.name,
    type: account.type,
    institution: account.institution ?? "",
    currency: account.currency,
    parentAccountId: account.parentAccountId ?? ""
  };
}

function AccountFormModal({
  open,
  editing,
  form,
  parentOptions,
  busy,
  onClose,
  onChange,
  onSubmit
}: {
  open: boolean;
  editing: AccountRecord | null;
  form: AccountFormState;
  parentOptions: AccountRecord[];
  busy: boolean;
  onClose: () => void;
  onChange: (patch: Partial<AccountFormState>) => void;
  onSubmit: () => void;
}): React.JSX.Element | null {
  if (!open) return null;

  const isValid = form.name.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-[1.75rem] border border-border bg-card shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {editing ? "Editar conta" : "Nova conta"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Os saldos são calculados pelas movimentações já lançadas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Fechar
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["checking", "cash", "credit", "investment"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ type, parentAccountId: type === "credit" ? form.parentAccountId : "" })}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-sm font-medium transition-colors",
                  form.type === type
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary text-foreground hover:bg-accent"
                )}
              >
                {accountTypeLabel(type)}
              </button>
            ))}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Nome da conta</span>
            <input
              value={form.name}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder="Ex: Nubank, Carteira, Reserva"
              className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Instituição</span>
              <input
                value={form.institution}
                onChange={(event) => onChange({ institution: event.target.value })}
                placeholder="Opcional"
                className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Moeda</span>
              <input
                value={form.currency}
                onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })}
                maxLength={3}
                className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
              />
            </label>
          </div>

          {form.type === "credit" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Conta mãe para pagamento</span>
              <select
                value={form.parentAccountId}
                onChange={(event) => onChange({ parentAccountId: event.target.value })}
                className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none transition-colors focus:border-primary/50"
              >
                <option value="">Nenhuma</option>
                {parentOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-border px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!isValid || busy}
            onClick={onSubmit}
            className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Salvando..." : editing ? "Salvar alterações" : "Criar conta"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountsPage(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [netWorthEntries, setNetWorthEntries] = useState<NetWorthEntry[]>([]);
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]>("1M");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError("");

    try {
      const [accountsPayload, netWorthPayload] = await Promise.all([
        fetchJsonOrThrow<AccountRecord[]>("/api/accounts"),
        fetchJsonOrThrow<NetWorthEntry[]>("/api/net-worth")
      ]);
      setAccounts(accountsPayload);
      setNetWorthEntries(netWorthPayload);
    } catch (loadError) {
      setAccounts([]);
      setNetWorthEntries([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar contas.");
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

  const assets = useMemo(() => resolveAccountAssets(accounts), [accounts]);
  const debts = useMemo(() => resolveAccountDebts(accounts), [accounts]);
  const netWorth = useMemo(() => Number((assets - debts).toFixed(2)), [assets, debts]);
  const history = useMemo(() => filterHistory(buildHistory(netWorthEntries, accounts), range), [accounts, netWorthEntries, range]);

  const chartShare = useMemo(() => {
    const positiveAccounts = accounts.filter((account) => account.currentBalance > 0);
    const checking = positiveAccounts
      .filter((account) => account.type === "checking" || account.type === "cash")
      .reduce((sum, account) => sum + account.currentBalance, 0);
    const investment = positiveAccounts
      .filter((account) => account.type === "investment")
      .reduce((sum, account) => sum + account.currentBalance, 0);
    const creditPositive = positiveAccounts
      .filter((account) => account.type === "credit")
      .reduce((sum, account) => sum + account.currentBalance, 0);

    return [
      { name: "Contas", value: Number(checking.toFixed(2)), color: "hsl(var(--info))" },
      { name: "Investimentos", value: Number(investment.toFixed(2)), color: "hsl(var(--success))" },
      { name: "Crédito positivo", value: Number(creditPositive.toFixed(2)), color: "hsl(var(--warning))" }
    ].filter((item) => item.value > 0);
  }, [accounts]);

  const groupedAccounts = useMemo(
    () => ({
      credit: accounts.filter((account) => account.type === "credit"),
      bank: accounts.filter((account) => account.type === "checking" || account.type === "cash"),
      wealth: accounts.filter((account) => account.type === "investment")
    }),
    [accounts]
  );

  const parentOptions = useMemo(
    () =>
      accounts.filter(
        (account) => account.type !== "credit" && (!editingAccount || account.id !== editingAccount.id)
      ),
    [accounts, editingAccount]
  );

  const openCreate = (): void => {
    setEditingAccount(null);
    setForm(DEFAULT_FORM);
    setFormOpen(true);
  };

  const openEdit = (account: AccountRecord): void => {
    setEditingAccount(account);
    setForm(openFormFromAccount(account));
    setFormOpen(true);
  };

  const saveAccount = async (): Promise<void> => {
    if (form.name.trim().length < 2) return;

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        institution: form.institution.trim() || null,
        currency: form.currency.trim().toUpperCase() || "BRL",
        parentAccountId: form.type === "credit" ? form.parentAccountId || null : null
      };

      if (editingAccount) {
        await fetchJsonOrThrow(`/api/accounts/${editingAccount.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Conta atualizada.");
      } else {
        await fetchJsonOrThrow("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast.success("Conta criada.");
      }

      setFormOpen(false);
      setEditingAccount(null);
      setForm(DEFAULT_FORM);
      notifyFinanceDataChanged();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Falha ao salvar conta.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAccount = async (account: AccountRecord): Promise<void> => {
    const confirmed = window.confirm(`Excluir "${account.name}"? As movimentações vinculadas podem ser removidas.`);
    if (!confirmed) return;

    try {
      await fetchJsonOrThrow(`/api/accounts/${account.id}`, {
        method: "DELETE"
      });
      toast.success("Conta removida.");
      notifyFinanceDataChanged();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Falha ao excluir conta.");
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (error && accounts.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="mb-4 text-sm text-error">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const renderGroup = (
    key: "credit" | "bank" | "wealth",
    items: AccountRecord[]
  ): React.JSX.Element => {
    const Icon = groupIcon(key);
    const total = Number(items.reduce((sum, account) => sum + account.currentBalance, 0).toFixed(2));

    return (
      <div className="glass-card overflow-hidden" key={key}>
        <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-card p-2 text-muted-foreground shadow-sm">
              <Icon size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{groupTitle(key)}</h3>
              <p className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "conta" : "contas"}
              </p>
            </div>
          </div>
          <div className={cn("geist-mono text-sm font-semibold", total >= 0 ? "text-foreground" : "text-error")}>
            {formatCurrency(Math.abs(total))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum item neste grupo.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((account) => (
              <div key={account.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-foreground">{account.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {account.institution || accountTypeLabel(account.type)}
                    {account.parentAccountId
                      ? ` • vinculado a ${accounts.find((item) => item.id === account.parentAccountId)?.name ?? "conta"}`
                      : ""}
                  </div>
                  {account.type === "credit" && account.cardMetrics ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>Fatura aberta {formatCurrency(account.cardMetrics.openDebt)}</span>
                      <span>Parcelas futuras {formatCurrency(account.cardMetrics.futureInstallments)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <div className={cn("geist-mono text-sm font-semibold", account.currentBalance >= 0 ? "text-foreground" : "text-error")}>
                    {formatCurrency(Math.abs(account.currentBalance))}
                  </div>
                  {account.confirmedBalance ? (
                    <div className="max-w-xs rounded-xl border border-border bg-secondary/70 px-3 py-2 text-right text-[11px] text-muted-foreground">
                      <div>
                        Banco {formatCurrency(account.confirmedBalance.amount)} em {formatConfirmedBalanceDate(account.confirmedBalance.date)}
                      </div>
                      {Math.abs(account.confirmedBalance.difference) >= 0.01 ? (
                        <div className={cn("mt-1", account.confirmedBalance.difference >= 0 ? "text-success" : "text-error")}>
                          Diferença calculada {formatCurrency(account.confirmedBalance.difference)}
                        </div>
                      ) : (
                        <div className="mt-1 text-success">Calculado confere com extrato</div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-right text-[11px] text-muted-foreground">
                      Saldo calculado
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(account)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <Edit3 size={14} />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAccount(account)}
                      className="inline-flex items-center gap-2 rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error/20"
                    >
                      <Trash2 size={14} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Contas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Estrutura bancária real integrada com saldos calculados pelo sistema.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                void load();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus size={16} />
              Nova conta
            </button>
          </div>
        </header>

        {accounts.length === 0 ? (
          <div className="glass-card">
            <EmptyState
              icon={Landmark}
              title="Nenhuma conta cadastrada"
              description="Crie a primeira conta para começar a receber lançamentos, importações e conciliações."
              actionLabel="Criar conta"
              onAction={openCreate}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_0.95fr]">
              <div className="glass-card p-6 sm:p-8">
                <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid gap-5 sm:grid-cols-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Ativos
                      </div>
                      <div className="mt-2 geist-mono text-3xl font-semibold tracking-tight text-foreground">
                        {formatCurrency(assets)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Dívidas
                      </div>
                      <div className="mt-2 geist-mono text-3xl font-semibold tracking-tight text-foreground">
                        {formatCurrency(debts)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Patrimônio líquido
                      </div>
                      <div className={cn("mt-2 geist-mono text-3xl font-semibold tracking-tight", netWorth >= 0 ? "text-foreground" : "text-error")}>
                        {formatCurrency(Math.abs(netWorth))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {RANGE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRange(option)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                          range === option
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 10, right: 0, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="accounts-assets" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="accounts-debts" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--error))" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="hsl(var(--error))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => (value === 0 ? "0" : `${Number(value) / 1000}k`)}
                        width={42}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card) / 0.96)",
                          backdropFilter: "blur(12px)",
                          border: "1px solid hsl(var(--border) / 0.9)",
                          borderRadius: "12px"
                        }}
                        formatter={(value: number | string | undefined, name?: string) => [
                          formatCurrency(Number(value ?? 0)),
                          name === "assets" ? "Ativos" : "Dívidas"
                        ]}
                      />
                      <Area type="monotone" dataKey="assets" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#accounts-assets)" />
                      <Area type="monotone" dataKey="debts" stroke="hsl(var(--error))" strokeWidth={2.5} fill="url(#accounts-debts)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Distribuição dos ativos atuais
                  </h2>
                </div>

                {chartShare.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-center text-sm text-muted-foreground">
                    Os ativos aparecem aqui quando houver saldo positivo em contas ou investimentos.
                  </div>
                ) : (
                  <>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartShare}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={86}
                            paddingAngle={4}
                            stroke="none"
                          >
                            {chartShare.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number | string | undefined) =>
                              formatCurrency(Number(value ?? 0))
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                      {chartShare.map((item) => (
                        <div key={item.name} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                          </div>
                          <span className="geist-mono text-sm font-semibold text-foreground">
                            {formatCurrency(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-5">
              {renderGroup("credit", groupedAccounts.credit)}
              {renderGroup("bank", groupedAccounts.bank)}
              {renderGroup("wealth", groupedAccounts.wealth)}
            </div>

            {error ? (
              <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
                {error}
              </div>
            ) : null}
          </>
        )}
      </div>

      <AccountFormModal
        open={formOpen}
        editing={editingAccount}
        form={form}
        parentOptions={parentOptions}
        busy={submitting}
        onClose={() => {
          setFormOpen(false);
          setEditingAccount(null);
          setForm(DEFAULT_FORM);
        }}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={() => void saveAccount()}
      />
    </>
  );
}
