import { useEffect, useState } from "react";
import type { Transaction } from "../utils/transactions";
import { STORAGE_KEY } from "../utils/transactions";

type UseTransactionsOptions = {
  storageKey?: string;
};

export function useTransactions(options: UseTransactionsOptions = {}) {
  const storageKey = options.storageKey ?? STORAGE_KEY;

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Transaction[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(transactions));
  }, [storageKey, transactions]);

  function addTransaction(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
  }

  function updateTransaction(updated: Transaction) {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === updated.id ? updated : transaction
      )
    );
  }

  function removeTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function clearTransactions() {
    setTransactions([]);
  }

  return {
    transactions,
    setTransactions,
    addTransaction,
    updateTransaction,
    removeTransaction,
    clearTransactions,
  };
}
