import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../utils/api";
import type { Transaction } from "../utils/transactions";

type ImportResult = {
  added: number;
};

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await requestJson<Transaction[]>("/api/transactions");
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  async function addTransaction(transaction: Transaction) {
    const created = await requestJson<Transaction>("/api/transactions", {
      method: "POST",
      body: transaction,
    });
    setTransactions((prev) => [created, ...prev]);
    return created;
  }

  async function updateTransaction(updated: Transaction) {
    const saved = await requestJson<Transaction>(
      `/api/transactions/${updated.id}`,
      {
        method: "PUT",
        body: updated,
      }
    );
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === saved.id ? saved : transaction
      )
    );
    return saved;
  }

  async function removeTransaction(id: string) {
    await requestJson<{ ok: boolean }>(`/api/transactions/${id}`, {
      method: "DELETE",
    });
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  async function clearTransactions() {
    await requestJson<{ ok: boolean }>("/api/transactions", {
      method: "DELETE",
    });
    setTransactions([]);
  }

  async function importTransactions(transactionsToImport: Transaction[]) {
    const result = await requestJson<ImportResult>("/api/transactions/import", {
      method: "POST",
      body: { transactions: transactionsToImport },
    });
    if (result.added > 0) {
      await loadTransactions();
    }
    return result.added;
  }

  return {
    transactions,
    loading,
    error,
    reload: loadTransactions,
    addTransaction,
    updateTransaction,
    removeTransaction,
    clearTransactions,
    importTransactions,
  };
}
