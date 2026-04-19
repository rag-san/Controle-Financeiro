"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { useAppShell } from "@/src/app-shell/AppShellContext";
import { cn } from "@/src/app-shell/utils";
import { fetchJsonOrThrow, notifyFinanceDataChanged } from "@/src/features/shared/fetch";

type FormState = {
  type: "income" | "expense";
  amount: string;
  description: string;
  categoryId: string;
  accountId: string;
  date: string;
  status: "posted" | "pending";
};

const EMPTY_FORM: FormState = {
  type: "expense",
  amount: "",
  description: "",
  categoryId: "",
  accountId: "",
  date: new Date().toISOString().slice(0, 10),
  status: "posted"
};

function formatAmountInput(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return "";
  const numeric = Number(digits) / 100;
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function NewTransactionModal(): React.JSX.Element | null {
  const {
    isTransactionModalOpen,
    editingTransaction,
    closeTransactionModal
  } = useAppShell();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTransactionModalOpen) return;

    let active = true;
    setLoadingMeta(true);

    void Promise.all([
      fetchJsonOrThrow<AccountDTO[]>("/api/accounts"),
      fetchJsonOrThrow<CategoryDTO[]>("/api/categories")
    ])
      .then(([nextAccounts, nextCategories]) => {
        if (!active) return;
        setAccounts(nextAccounts);
        setCategories(nextCategories);
      })
      .catch((error) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Falha ao carregar dados do formulario.");
      })
      .finally(() => {
        if (active) {
          setLoadingMeta(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isTransactionModalOpen]);

  useEffect(() => {
    if (!isTransactionModalOpen) return;

    if (editingTransaction) {
      setForm({
        type: editingTransaction.amount >= 0 ? "income" : "expense",
        amount: Math.abs(editingTransaction.amount).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }),
        description: editingTransaction.description,
        categoryId: editingTransaction.categoryId ?? "",
        accountId: editingTransaction.accountId,
        date: editingTransaction.date.slice(0, 10),
        status: editingTransaction.status
      });
      return;
    }

    setForm({
      ...EMPTY_FORM,
      accountId: accounts[0]?.id ?? "",
      categoryId: ""
    });
  }, [accounts, editingTransaction, isTransactionModalOpen]);

  const isValid = useMemo(() => {
    return Boolean(form.accountId && form.amount && form.description.trim().length >= 2 && form.date);
  }, [form]);

  const handleSave = async (): Promise<void> => {
    if (!isValid) return;

    setSaving(true);
    try {
      const payload = {
        accountId: form.accountId,
        categoryId: form.categoryId || null,
        date: form.date,
        description: form.description.trim(),
        amount: form.amount,
        type: form.type,
        status: form.status
      };

      if (editingTransaction) {
        await fetchJsonOrThrow(`/api/transactions/${editingTransaction.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        toast.success("Transacao atualizada com sucesso.");
      } else {
        await fetchJsonOrThrow("/api/transactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        toast.success("Transacao criada com sucesso.");
      }

      notifyFinanceDataChanged();
      closeTransactionModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar a transacao.");
    } finally {
      setSaving(false);
    }
  };

  if (!isTransactionModalOpen) return null;

  const isExpense = form.type === "expense";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={closeTransactionModal}
      />

      <motion.div
        initial={{ opacity: 0, y: 80, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className={cn(
          "relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl sm:rounded-3xl",
          isExpense ? "border-error/20" : "border-success/20"
        )}
      >
          <div className="flex w-full justify-center pb-1 pt-3 sm:hidden">
            <div className="h-1.5 w-12 rounded-full bg-border" />
          </div>

          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <div className="flex rounded-2xl border border-border bg-secondary p-1">
              {(["expense", "income"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((previous) => ({ ...previous, type }))}
                  className={cn(
                    "rounded-xl px-5 py-2 text-sm font-semibold transition-colors",
                    form.type === type
                      ? type === "expense"
                        ? "bg-error/10 text-error"
                        : "bg-success/10 text-success"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type === "expense" ? "Despesa" : "Receita"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={closeTransactionModal}
              className="rounded-full p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <div className="hide-scrollbar flex flex-col gap-5 overflow-y-auto px-5 py-4">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="flex w-full items-baseline justify-center gap-2">
                <span className={cn("text-2xl font-medium", isExpense ? "text-error" : "text-success")}>R$</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      amount: formatAmountInput(event.target.value)
                    }))
                  }
                  placeholder="0,00"
                  className="w-full max-w-[280px] border-none bg-transparent text-center font-mono text-5xl font-semibold tracking-tighter text-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descricao</label>
              <input
                type="text"
                value={form.description}
                onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="Ex: Mercado, Uber, Salario..."
                className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categoria</label>
              <div className="relative">
                <select
                  value={form.categoryId}
                  onChange={(event) => setForm((previous) => ({ ...previous, categoryId: event.target.value }))}
                  className="w-full appearance-none rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/50"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta</label>
                <div className="relative">
                  <select
                    value={form.accountId}
                    onChange={(event) => setForm((previous) => ({ ...previous, accountId: event.target.value }))}
                    className="w-full appearance-none rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/50"
                    disabled={loadingMeta}
                  >
                    <option value="">Selecione...</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))}
                  className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</label>
              <div className="grid grid-cols-2 gap-3">
                {(["posted", "pending"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setForm((previous) => ({ ...previous, status }))}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
                      form.status === status
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {status === "posted" ? "Confirmada" : "Pendente"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!isValid || saving}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all duration-300",
                isValid
                  ? isExpense
                    ? "bg-error hover:bg-error/90"
                    : "bg-success hover:bg-success/90"
                  : "cursor-not-allowed bg-secondary text-muted-foreground"
              )}
            >
              {saving ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <>
                  <Check size={18} />
                  {editingTransaction ? "Salvar alteracoes" : "Salvar transacao"}
                </>
              )}
            </button>
          </div>
      </motion.div>
    </div>
  );
}
