"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ListFilter,
  MoreHorizontal,
  Search,
  Tag,
  Trash2,
  UploadCloud
} from "lucide-react";
import type { AccountDTO, CategoryDTO, TransactionDTO } from "@/lib/types";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { EmptyState } from "@/src/app-shell/components/EmptyState";
import { PageSkeleton } from "@/src/app-shell/components/ShellSkeleton";
import { cn, formatCurrency } from "@/src/app-shell/utils";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";

type TransactionsResponse = {
  items: TransactionDTO[];
  summary: {
    income: number;
    expense: number;
    balance: number;
    netBudget?: number;
    periodCashInflow?: number;
    periodCashOutflow?: number;
    periodCashFlow?: number;
    cashBalance?: number;
  };
  meta: {
    accounts: AccountDTO[];
    categories: CategoryDTO[];
  };
};

const PERIOD_OPTIONS = [
  { label: "Ultimos 7 dias", value: "7d" },
  { label: "Ultimos 30 dias", value: "30d" },
  { label: "Este mes", value: "this-month" },
  { label: "Mes passado", value: "last-month" },
  { label: "Todos", value: "all" }
] as const;

const TYPE_OPTIONS = [
  { label: "Todas as Transacoes", value: "" },
  { label: "Apenas Receitas", value: "income" },
  { label: "Apenas Despesas", value: "expense" },
  { label: "Transferencias", value: "transfer" }
] as const;

function formatTransactionDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function categoryChipStyle(category?: CategoryDTO | null): React.CSSProperties | undefined {
  if (!category?.color) return undefined;
  return {
    color: category.color,
    borderColor: `${category.color}40`,
    backgroundColor: `${category.color}1A`
  };
}

function categoryEmoji(category?: CategoryDTO | null): string {
  const name = (category?.name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (name.includes("merc")) return "🛒";
  if (name.includes("rest") || name.includes("aliment")) return "🍔";
  if (name.includes("morad") || name.includes("alug")) return "🏠";
  if (name.includes("transp") || name.includes("comb")) return "⛽";
  if (name.includes("internet")) return "🌐";
  if (name.includes("saud") || name.includes("farm")) return "💊";
  if (name.includes("lazer")) return "🎉";
  if (name.includes("renda") || name.includes("salario")) return "💼";
  return "✨";
}

function transactionAmountSign(transaction: TransactionDTO): string {
  if (transaction.amount > 0) return "+";
  if (transaction.amount < 0) return "-";
  return "";
}

function transactionAmountClass(transaction: TransactionDTO): string {
  if (transaction.type === "transfer") return "text-info";
  if (transaction.amount >= 0) return "text-success";
  return "text-error";
}

function transactionCategoryLabel(transaction: TransactionDTO): string {
  if (transaction.category?.name) return transaction.category.name;
  if (transaction.type === "transfer") return "Transferencia";
  return "Sem categoria";
}

export function TransactionsPage(): React.JSX.Element {
  const { hideValues, openImportModal, openTransactionModal } = useAppShell();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [summary, setSummary] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    netBudget: 0,
    periodCashInflow: 0,
    periodCashOutflow: 0,
    periodCashFlow: 0,
    cashBalance: 0
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<(typeof PERIOD_OPTIONS)[number]["value"]>("30d");
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams({
        period,
        pageSize: "200",
        includeMeta: "true",
        sort: "date_desc"
      });
      if (type) query.set("type", type);
      if (categoryId) query.set("categoryId", categoryId);
      if (search.trim()) query.set("q", search.trim());

      const payload = await fetchJsonOrThrow<TransactionsResponse>(`/api/transactions?${query.toString()}`);
      setTransactions(payload.items);
      setCategories(payload.meta.categories ?? []);
      setSummary({
        income: payload.summary?.income ?? 0,
        expense: payload.summary?.expense ?? 0,
        balance: payload.summary?.balance ?? 0,
        netBudget: payload.summary?.netBudget ?? payload.summary?.balance ?? 0,
        periodCashInflow: payload.summary?.periodCashInflow ?? payload.summary?.income ?? 0,
        periodCashOutflow: payload.summary?.periodCashOutflow ?? payload.summary?.expense ?? 0,
        periodCashFlow: payload.summary?.periodCashFlow ?? 0,
        cashBalance: payload.summary?.cashBalance ?? 0
      });
    } catch (loadError) {
      setTransactions([]);
      setCategories([]);
      setSummary({
        income: 0,
        expense: 0,
        balance: 0,
        netBudget: 0,
        periodCashInflow: 0,
        periodCashOutflow: 0,
        periodCashFlow: 0,
        cashBalance: 0
      });
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar transacoes.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, period, search, type]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    const onDataChanged = (): void => {
      void load();
    };
    window.addEventListener("finance-data-changed", onDataChanged);
    return () => window.removeEventListener("finance-data-changed", onDataChanged);
  }, [load]);

  useEffect(() => {
    const closeMenus = (): void => setOpenMenuId(null);
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  const deleteTransactions = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    try {
      if (ids.length === 1) {
        await fetchJsonOrThrow(`/api/transactions/${ids[0]}`, {
          method: "DELETE"
        });
      } else {
        await fetchJsonOrThrow("/api/transactions", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ ids })
        });
      }

      setSelectedIds(new Set());
      notifyFinanceDataChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Nao foi possivel excluir transacoes.");
    }
  };

  const categoryLabel = useMemo(() => {
    if (!categoryId) return "Categorias";
    return categories.find((category) => category.id === categoryId)?.name ?? "Categorias";
  }, [categories, categoryId]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (error && transactions.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="mb-4 text-sm text-error">{error}</p>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="mb-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Transacoes</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={openImportModal}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:px-4"
          >
            <UploadCloud size={16} className="text-muted-foreground" />
            <span className="hidden sm:inline">Importar extrato</span>
          </button>
          <button
            onClick={() => openTransactionModal()}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
          >
            Nova Transacao
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as (typeof PERIOD_OPTIONS)[number]["value"])}
          className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none transition-colors hover:bg-accent"
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(event) => setType(event.target.value as (typeof TYPE_OPTIONS)[number]["value"])}
          className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none transition-colors hover:bg-accent"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none transition-colors hover:bg-accent"
        >
          <option value="">Todas as Categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        {(period !== "30d" || type || categoryId || search) ? (
          <button
            onClick={() => {
              setPeriod("30d");
              setType("");
              setCategoryId("");
              setSearch("");
            }}
            className="px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar transacoes..."
              className="w-full rounded-lg border border-border bg-secondary py-2 pl-10 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm font-medium lg:gap-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ListFilter size={16} />
              <span>{transactions.length}</span>
            </div>
            <div className={cn("flex items-center gap-2", summary.cashBalance >= 0 ? "text-success" : "text-error")}>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Saldo atual</span>
              <span className="geist-mono">{formatCurrency(summary.cashBalance, hideValues)}</span>
            </div>
            <div className="flex items-center gap-2 text-success">
              <ArrowDownRight size={16} />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Entradas periodo</span>
              <span className="geist-mono">{formatCurrency(summary.periodCashInflow, hideValues)}</span>
            </div>
            <div className="flex items-center gap-2 text-error">
              <ArrowUpRight size={16} />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Gastos periodo</span>
              <span className="geist-mono">{formatCurrency(summary.periodCashOutflow, hideValues)}</span>
            </div>
            <div className={cn("flex items-center gap-2", summary.periodCashFlow >= 0 ? "text-success" : "text-error")}>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Movimento</span>
              <span className="geist-mono">{formatCurrency(summary.periodCashFlow, hideValues)}</span>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="border-b border-primary/20 bg-primary/10 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-primary">
                {selectedIds.size} {selectedIds.size === 1 ? "transacao selecionada" : "transacoes selecionadas"}
              </span>
              <button
                onClick={() => void deleteTransactions([...selectedIds])}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-error/10 px-3 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error/20"
              >
                <Trash2 size={14} />
                Deletar selecionadas
              </button>
            </div>
          </div>
        ) : null}

        {transactions.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhuma transacao encontrada"
            description={`Nenhuma transacao corresponde a "${categoryLabel}" com os filtros aplicados.`}
            actionLabel="Nova Transacao"
            onAction={() => openTransactionModal()}
          />
        ) : (
          <>
            <div className="grid gap-3 p-4 md:hidden">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className={cn("glass-card rounded-2xl p-4 transition-colors", selectedIds.has(transaction.id) ? "bg-primary/5" : "hover:bg-secondary")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(transaction.id)) next.delete(transaction.id);
                      else next.add(transaction.id);
                      return next;
                    });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {selectedIds.has(transaction.id) ? (
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary" />
                      ) : (
                        <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 space-y-2">
                        <div className="truncate font-medium text-foreground">{transaction.description}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-md border px-2.5 py-1 text-[10px] font-medium tracking-wide" style={categoryChipStyle(transaction.category)}>
                            {categoryEmoji(transaction.category)} {transactionCategoryLabel(transaction)}
                          </span>
                          <span>{formatTransactionDate(transaction.date)}</span>
                          <span>{transaction.account.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className={cn("geist-mono text-right text-sm font-medium", transactionAmountClass(transaction))}>
                        {transactionAmountSign(transaction)} {formatCurrency(Math.abs(transaction.amount), hideValues)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openTransactionModal(transaction);
                      }}
                      className="flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteTransactions([transaction.id]);
                      }}
                      className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error/20"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="w-10 px-6 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIds((previous) =>
                            previous.size === transactions.length ? new Set() : new Set(transactions.map((transaction) => transaction.id))
                          )
                        }
                      >
                        {selectedIds.size === transactions.length ? (
                          <CheckCircle2 size={16} className="text-primary" />
                        ) : (
                          <Circle size={16} className="text-muted-foreground" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4">Descricao</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Conta</th>
                    <th className="px-6 py-4 text-right">Valor</th>
                    <th className="w-16 px-6 py-4 text-center">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className={cn("group cursor-pointer transition-colors", selectedIds.has(transaction.id) ? "bg-primary/5" : "hover:bg-secondary")}
                      onClick={() =>
                        setSelectedIds((previous) => {
                          const next = new Set(previous);
                          if (next.has(transaction.id)) next.delete(transaction.id);
                          else next.add(transaction.id);
                          return next;
                        })
                      }
                    >
                      <td className="px-6 py-4">
                        {selectedIds.has(transaction.id) ? <CheckCircle2 size={16} className="text-primary" /> : <Circle size={16} className="text-muted-foreground" />}
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">{transaction.description}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-medium tracking-wide" style={categoryChipStyle(transaction.category)}>
                          <span>{categoryEmoji(transaction.category)}</span>
                          {transactionCategoryLabel(transaction)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{formatTransactionDate(transaction.date)}</td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{transaction.account.name}</td>
                      <td className={cn("px-6 py-4 text-right font-medium geist-mono", transactionAmountClass(transaction))}>
                        {transactionAmountSign(transaction)} {formatCurrency(Math.abs(transaction.amount), hideValues)}
                      </td>
                      <td className="relative px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId((previous) => (previous === transaction.id ? null : transaction.id));
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {openMenuId === transaction.id ? (
                          <div
                            className="absolute right-12 top-1/2 z-50 w-44 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-xl"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                openTransactionModal(transaction);
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <Tag size={14} />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void deleteTransactions([transaction.id]);
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-error transition-colors hover:bg-error/10"
                            >
                              <Trash2 size={14} />
                              Excluir
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
