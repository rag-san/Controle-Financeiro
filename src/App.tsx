import { useEffect, useMemo, useState } from "react";
import { Card } from "./components/Card";

type TransactionType = "entrada" | "saida";

type Category =
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Lazer"
  | "Saúde"
  | "Educação"
  | "Assinaturas"
  | "Salário"
  | "Outros";

type Transaction = {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  category: Category;
};

const STORAGE_KEY = "cf_transactions_v2";

const CATEGORIES: Category[] = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Lazer",
  "Saúde",
  "Educação",
  "Assinaturas",
  "Salário",
  "Outros",
];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function App() {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Transaction[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // FORM
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("entrada");
  const [category, setCategory] = useState<Category>("Outros");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // FILTROS
  const [filterType, setFilterType] = useState<"todos" | TransactionType>(
    "todos"
  );
  const [filterCategory, setFilterCategory] = useState<"todas" | Category>(
    "todas"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const typeOk = filterType === "todos" ? true : t.type === filterType;
      const catOk =
        filterCategory === "todas" ? true : t.category === filterCategory;
      return typeOk && catOk;
    });
  }, [transactions, filterType, filterCategory]);

  const summary = useMemo(() => {
    const income = filteredTransactions
      .filter((t) => t.type === "entrada")
      .reduce((acc, t) => acc + t.amount, 0);

    const expense = filteredTransactions
      .filter((t) => t.type === "saida")
      .reduce((acc, t) => acc + t.amount, 0);

    const balance = income - expense;

    return { income, expense, balance };
  }, [filteredTransactions]);

  function addTransaction() {
    const numericAmount = Number(amount);

    if (!title.trim()) return alert("Digite um título!");
    if (!numericAmount || numericAmount <= 0)
      return alert("Digite um valor válido!");
    if (!date) return alert("Escolha uma data!");

    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      type,
      title: title.trim(),
      amount: numericAmount,
      date,
      category,
    };

    setTransactions((prev) => [newTransaction, ...prev]);

    // limpar form
    setTitle("");
    setAmount("");
    setType("entrada");
    setCategory("Outros");
    setDate(new Date().toISOString().slice(0, 10));
    setIsFormOpen(false);
  }

  function removeTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function clearAll() {
    const ok = confirm("Tem certeza que quer apagar todas as transações?");
    if (!ok) return;
    setTransactions([]);
    setIsFormOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">
              Controle Financeiro
            </h1>
            <p className="text-sm text-slate-500">
              MVP · Entradas, Saídas e Categorias
            </p>
          </div>

          <span className="text-xs rounded-full border px-3 py-1 text-slate-600">
            Janeiro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <Card title="Saldo (filtrado)">
            <p className="text-2xl font-bold">{formatBRL(summary.balance)}</p>
            <p className="mt-1 text-xs text-slate-500">Atual</p>
          </Card>

          <Card title="Entradas (filtrado)">
            <p className="text-xl font-semibold text-emerald-600">
              {formatBRL(summary.income)}
            </p>
            <p className="mt-1 text-xs text-slate-500">No mês</p>
          </Card>

          <Card title="Saídas (filtrado)">
            <p className="text-xl font-semibold text-rose-600">
              {formatBRL(summary.expense)}
            </p>
            <p className="mt-1 text-xs text-slate-500">No mês</p>
          </Card>
        </section>

        <Card
          title="Transações"
          right={
            <div className="flex gap-2">
              <button
                onClick={() => setIsFormOpen((v) => !v)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 active:bg-slate-900"
              >
                + Nova
              </button>
              <button
                onClick={clearAll}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                title="Apagar tudo"
              >
                Limpar
              </button>
            </div>
          }
        >
          {/* FILTROS */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Filtrar por tipo</label>
              <select
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as "todos" | TransactionType)
                }
                className="rounded-lg border px-3 py-2"
              >
                <option value="todos">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Filtrar por categoria</label>
              <select
                value={filterCategory}
                onChange={(e) =>
                  setFilterCategory(e.target.value as "todas" | Category)
                }
                className="rounded-lg border px-3 py-2"
              >
                <option value="todas">Todas</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* FORM */}
          {isFormOpen && (
            <div className="mb-4 grid gap-3 rounded-xl border p-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Título</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-lg border px-3 py-2"
                  placeholder="Ex: Mercado"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Valor</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-lg border px-3 py-2"
                  placeholder="Ex: 150"
                  inputMode="numeric"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Tipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TransactionType)}
                  className="rounded-lg border px-3 py-2"
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="rounded-lg border px-3 py-2"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border px-3 py-2"
                />
              </div>

              <button
                onClick={addTransaction}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                Salvar
              </button>
            </div>
          )}

          {/* LISTA */}
          {filteredTransactions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Nenhuma transação encontrada</p>
              <p className="mt-1 text-sm text-slate-500">
                Tente mudar os filtros ou cadastrar uma nova.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {t.date} · {t.category}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <p
                      className={
                        "font-semibold " +
                        (t.type === "entrada"
                          ? "text-emerald-600"
                          : "text-rose-600")
                      }
                    >
                      {t.type === "entrada" ? "+" : "-"} {formatBRL(t.amount)}
                    </p>

                    <button
                      onClick={() => removeTransaction(t.id)}
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      title="Excluir"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
