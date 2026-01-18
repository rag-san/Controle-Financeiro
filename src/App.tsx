import { useMemo, useState } from "react";
import { Card } from "./components/Card";

type TransactionType = "entrada" | "saida";

type Transaction = {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function App() {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("entrada");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const summary = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "entrada")
      .reduce((acc, t) => acc + t.amount, 0);

    const expense = transactions
      .filter((t) => t.type === "saida")
      .reduce((acc, t) => acc + t.amount, 0);

    const balance = income - expense;

    return { income, expense, balance };
  }, [transactions]);

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
    };

    setTransactions((prev) => [newTransaction, ...prev]);

    // limpar form
    setTitle("");
    setAmount("");
    setType("entrada");
    setDate(new Date().toISOString().slice(0, 10));

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
            <p className="text-sm text-slate-500">MVP · Entradas e Saídas</p>
          </div>

          <span className="text-xs rounded-full border px-3 py-1 text-slate-600">
            Janeiro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <Card title="Saldo">
            <p className="text-2xl font-bold">{formatBRL(summary.balance)}</p>
            <p className="mt-1 text-xs text-slate-500">Atual</p>
          </Card>

          <Card title="Entradas">
            <p className="text-xl font-semibold text-emerald-600">
              {formatBRL(summary.income)}
            </p>
            <p className="mt-1 text-xs text-slate-500">No mês</p>
          </Card>

          <Card title="Saídas">
            <p className="text-xl font-semibold text-rose-600">
              {formatBRL(summary.expense)}
            </p>
            <p className="mt-1 text-xs text-slate-500">No mês</p>
          </Card>
        </section>

        <Card
          title="Transações"
          right={
            <button
              onClick={() => setIsFormOpen((v) => !v)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 active:bg-slate-900"
            >
              + Nova
            </button>
          }
        >
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

          {transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Nenhuma transação ainda</p>
              <p className="mt-1 text-sm text-slate-500">
                Clique em <span className="font-semibold">+ Nova</span> para
                cadastrar a primeira.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.date}</p>
                  </div>

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
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
