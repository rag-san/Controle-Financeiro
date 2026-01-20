import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Card } from "./components/Card";
import { useCategories } from "./hooks/useCategories";
import { useCsvImport } from "./hooks/useCsvImport";
import { useTransactions } from "./hooks/useTransactions";
import { getAuthToken, requestJson, setAuthToken } from "./utils/api";
import {
  autoCategorize,
  buildTransactionsCsv,
  ensureDefaultCategory,
  formatBRL,
  normalizeSpaces,
  parseAmount,
  type Category,
  type Transaction,
  type TransactionType,
} from "./utils/transactions";

export default function App() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(
    null
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isAuthenticated = Boolean(user);

  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    addTransaction,
    updateTransaction,
    removeTransaction,
    clearTransactions,
    importTransactions,
  } = useTransactions({ enabled: isAuthenticated });

  // FORM (manual)
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("entrada");
  const [category, setCategory] = useState<Category>("Outros");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryInput, setCategoryInput] = useState("");

  // FILTROS
  const [filterType, setFilterType] = useState<"todos" | TransactionType>(
    "todos"
  );
  const [filterCategory, setFilterCategory] = useState<"todas" | Category>(
    "todas"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    addCategory,
    removeCategory,
    resetCategories,
  } = useCategories({ enabled: isAuthenticated });

  const categoriesForSelect = useMemo(
    () =>
      ensureDefaultCategory([
        ...categories,
        ...transactions.map((transaction) => transaction.category),
      ]),
    [categories, transactions]
  );

  const monthLabel = useMemo(
    () =>
      new Date().toLocaleString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
    []
  );

  const {
    isImportOpen,
    setIsImportOpen,
    importStatus,
    importError,
    csvDelimiter,
    csvHeaders,
    mapDateIdx,
    mapDescIdx,
    mapValueIdx,
    importPreview,
    setMapDateIdx,
    setMapDescIdx,
    setMapValueIdx,
    handleCSVFile,
    importPreviewIntoApp,
    closeImport,
  } = useCsvImport({
    existingTransactions: transactions,
    onImport: importTransactions,
    categories: categoriesForSelect,
  });

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthReady(true);
      return;
    }

    requestJson<{ id: string; name: string; email: string }>("/api/auth/me")
      .then((profile) => {
        setUser(profile);
      })
      .catch(() => {
        setAuthToken(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = normalizeSpaces(searchQuery).toLowerCase();

    return transactions.filter((t) => {
      const typeOk = filterType === "todos" ? true : t.type === filterType;
      const catOk =
        filterCategory === "todas" ? true : t.category === filterCategory;
      const searchOk = normalizedQuery
        ? `${t.title} ${t.category}`
            .toLowerCase()
            .includes(normalizedQuery)
        : true;

      return typeOk && catOk && searchOk;
    });
  }, [transactions, filterType, filterCategory, searchQuery]);

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

  const totalsByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of filteredTransactions) {
      if (t.type !== "saida") continue;
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredTransactions]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      return {
        key,
        label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }),
      };
    });
  }, []);

  const monthlyTotalsByType = useMemo(() => {
    const totals = new Map(
      months.map((m) => [m.key, { income: 0, expense: 0 }])
    );

    for (const t of filteredTransactions) {
      const key = t.date.slice(0, 7);
      const current = totals.get(key);
      if (!current) continue;
      if (t.type === "entrada") {
        current.income += t.amount;
      } else {
        current.expense += t.amount;
      }
    }

    return months.map((m) => ({
      ...m,
      income: totals.get(m.key)?.income ?? 0,
      expense: totals.get(m.key)?.expense ?? 0,
    }));
  }, [filteredTransactions, months]);

  const maxCategoryTotal =
    totalsByCategory.length > 0 ? totalsByCategory[0][1] : 0;
  const maxMonthIncome = Math.max(
    ...monthlyTotalsByType.map((m) => m.income),
    0
  );
  const maxMonthExpense = Math.max(
    ...monthlyTotalsByType.map((m) => m.expense),
    0
  );
  const balanceTone =
    summary.balance > 0
      ? "text-emerald-600"
      : summary.balance < 0
      ? "text-rose-600"
      : "text-slate-500";
  function getMonthTotalChange(current: number, previous: number) {
    if (previous <= 0) return current > 0 ? 100 : 0;
    return Math.round((current / previous) * 100);
  }

  const currentMonthKey = months[months.length - 1]?.key ?? "";
  const previousMonthKey = months[months.length - 2]?.key ?? "";
  const currentMonthTotals = monthlyTotalsByType.find(
    (m) => m.key === currentMonthKey
  );
  const previousMonthTotals = monthlyTotalsByType.find(
    (m) => m.key === previousMonthKey
  );

  const incomeChange = getMonthTotalChange(
    currentMonthTotals?.income ?? 0,
    previousMonthTotals?.income ?? 0
  );
  const expenseChange = getMonthTotalChange(
    currentMonthTotals?.expense ?? 0,
    previousMonthTotals?.expense ?? 0
  );

  function resetForm() {
    setTitle("");
    setAmount("");
    setType("entrada");
    setCategory("Outros");
    setDate(new Date().toISOString().slice(0, 10));
  }

  function toggleForm() {
    if (isFormOpen) {
      setEditingId(null);
      resetForm();
      setIsFormOpen(false);
      return;
    }

    setIsFormOpen(true);
  }

  async function handleSave() {
    const numericAmount = parseAmount(amount);

    if (!title.trim()) return alert("Digite um título!");
    if (numericAmount === null || numericAmount <= 0)
      return alert("Digite um valor válido!");
    if (!date) return alert("Escolha uma data!");

    const payload: Transaction = {
      id: editingId ?? crypto.randomUUID(),
      type,
      title: title.trim(),
      amount: Math.abs(numericAmount),
      date,
      category,
    };

    try {
      if (editingId) {
        await updateTransaction(payload);
      } else {
        await addTransaction(payload);
      }
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a transação."
      );
      return;
    }

    setEditingId(null);
    resetForm();
    setIsFormOpen(false);
  }

  function startEdit(transaction: Transaction) {
    setIsFormOpen(true);
    setEditingId(transaction.id);
    setTitle(transaction.title);
    setAmount(transaction.amount.toString().replace(".", ","));
    setType(transaction.type);
    setCategory(transaction.category);
    setDate(transaction.date);
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
    setIsFormOpen(false);
  }

  async function clearAll() {
    try {
      await clearTransactions();
      setIsFormOpen(false);
      setEditingId(null);
      closeImport();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível limpar as transações."
      );
    }
  }

  function handleExportCsv() {
    if (filteredTransactions.length === 0) {
      alert("Não há transações para exportar.");
      return;
    }

    const csv = buildTransactionsCsv(filteredTransactions);
    const blob = new Blob([`\ufeff${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transacoes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleAddCategory() {
    try {
      await addCategory(categoryInput);
      setCategoryInput("");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar categoria."
      );
    }
  }

  async function handleUpdateTransaction(next: Transaction) {
    try {
      await updateTransaction(next);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a transação."
      );
    }
  }

  async function handleRemoveTransaction(id: string) {
    try {
      await removeTransaction(id);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a transação."
      );
    }
  }

  async function handleAutoSuggestCategory(transaction: Transaction) {
    const suggested = autoCategorize(transaction.title, categoriesForSelect);
    await handleUpdateTransaction({
      ...transaction,
      category: suggested,
    });
  }

  async function handleLoginSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const data = await requestJson<{
        token: string;
        user: { id: string; name: string; email: string };
      }>("/api/auth/login", {
        method: "POST",
        body: { email: authEmail, password: authPassword },
        auth: false,
      });
      setAuthToken(data.token);
      setUser(data.user);
      setAuthPassword("");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Não foi possível entrar."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegisterSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      await requestJson<{ ok: boolean }>("/api/auth/register", {
        method: "POST",
        body: { name: authName, email: authEmail, password: authPassword },
        auth: false,
      });
      setAuthMode("login");
      setAuthPassword("");
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a conta."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await requestJson<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-700 flex items-center justify-center">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 py-12 lg:flex-row">
          <div className="w-full max-w-md space-y-4">
            <div className="rounded-3xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-400 p-6 text-white shadow-lg">
              <h1 className="text-2xl font-semibold">Controle Financeiro</h1>
              <p className="mt-2 text-sm text-white/90">
                Entre para acompanhar seus gastos com segurança.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`flex-1 rounded-full px-4 py-2 text-sm ${
                    authMode === "login"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 text-slate-600"
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className={`flex-1 rounded-full px-4 py-2 text-sm ${
                    authMode === "register"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 text-slate-600"
                  }`}
                >
                  Criar conta
                </button>
              </div>

              {authMode === "login" ? (
                <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Email
                    </label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      required
                    />
                  </div>
                  {authError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {authError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {authLoading ? "Entrando..." : "Entrar"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Nome
                    </label>
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Email
                    </label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      required
                    />
                  </div>
                  {authError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {authError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {authLoading ? "Criando..." : "Criar conta"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-20 flex-col items-center gap-6 bg-white py-6 shadow-sm md:flex">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            $
          </div>
          <nav className="flex flex-col gap-4 text-slate-400">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              ⌁
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-slate-100">
              📈
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-slate-100">
              📂
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-slate-100">
              ⚙️
            </span>
          </nav>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h1 className="text-xl font-semibold">Dashboard</h1>
                <p className="text-sm text-slate-500">
                  Bem-vindo(a), {user.name}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border bg-white px-3 py-1 text-xs text-slate-600">
                  {monthLabel}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-full border px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Sair
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Saldo do mês">
                <p className={`text-2xl font-bold ${balanceTone}`}>
                  {formatBRL(summary.balance)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Resultado atual</p>
              </Card>
              <Card title="Receitas">
                <p className="text-xl font-semibold text-emerald-600">
                  {formatBRL(summary.income)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Entradas</p>
              </Card>
              <Card title="Despesas">
                <p className="text-xl font-semibold text-rose-600">
                  {formatBRL(summary.expense)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Saídas</p>
              </Card>
              <Card title="Categorias">
                <p className="text-xl font-semibold text-slate-900">
                  {categoriesForSelect.length}
                </p>
                <p className="mt-1 text-xs text-slate-500">Ativas</p>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-[2fr,3fr]">
              <Card title="Categorias (top gastos)">
                {totalsByCategory.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Sem dados de saídas. Adicione gastos para gerar insights.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {totalsByCategory.map(([cat, total]) => {
                      const percentage =
                        maxCategoryTotal > 0
                          ? (total / maxCategoryTotal) * 100
                          : 0;
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{cat}</span>
                            <span className="text-slate-500">
                              {formatBRL(total)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-emerald-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card title="Resumo mensal (últimos 6 meses)">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-emerald-700">
                          Receitas
                        </p>
                        <p className="mt-1 text-xs text-emerald-700/70">
                          Comparação com o mês anterior
                        </p>
                      </div>
                      <div
                        className="relative flex h-16 w-16 items-center justify-center rounded-full"
                        style={{
                          background: `conic-gradient(#10b981 ${Math.min(
                            incomeChange,
                            100
                          )}%, #e2e8f0 0)`,
                        }}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-emerald-700">
                          {incomeChange}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {monthlyTotalsByType.map((m) => {
                        const percentage =
                          maxMonthIncome > 0
                            ? (m.income / maxMonthIncome) * 100
                            : 0;
                        return (
                          <div key={`income-${m.key}`} className="space-y-1">
                            <div className="flex justify-between text-xs text-emerald-800">
                              <span className="font-medium">{m.label}</span>
                              <span className="text-emerald-700/70">
                                {formatBRL(m.income)}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-emerald-100">
                              <div
                                className="h-2 rounded-full bg-emerald-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-rose-700">
                          Despesas
                        </p>
                        <p className="mt-1 text-xs text-rose-700/70">
                          Comparação com o mês anterior
                        </p>
                      </div>
                      <div
                        className="relative flex h-16 w-16 items-center justify-center rounded-full"
                        style={{
                          background: `conic-gradient(#f43f5e ${Math.min(
                            expenseChange,
                            100
                          )}%, #e2e8f0 0)`,
                        }}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-rose-700">
                          {expenseChange}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {monthlyTotalsByType.map((m) => {
                        const percentage =
                          maxMonthExpense > 0
                            ? (m.expense / maxMonthExpense) * 100
                            : 0;
                        return (
                          <div key={`expense-${m.key}`} className="space-y-1">
                            <div className="flex justify-between text-xs text-rose-800">
                              <span className="font-medium">{m.label}</span>
                              <span className="text-rose-700/70">
                                {formatBRL(m.expense)}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-rose-100">
                              <div
                                className="h-2 rounded-full bg-rose-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            <Card
              title="Transações"
              right={
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={toggleForm}
                    className="rounded-full bg-indigo-600 px-4 py-2 text-xs text-white hover:bg-indigo-500"
                  >
                    {isFormOpen ? "Fechar" : "+ Nova"}
                  </button>

                  <button
                    onClick={() =>
                      isImportOpen ? closeImport() : setIsImportOpen(true)
                    }
                    className="rounded-full border px-4 py-2 text-xs hover:bg-slate-50"
                    title="Importar extrato"
                  >
                    Importar CSV
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="rounded-full border px-4 py-2 text-xs hover:bg-slate-50"
                    title="Exportar transações filtradas"
                  >
                    Exportar CSV
                  </button>

                  <button
                    onClick={() => void clearAll()}
                    className="rounded-full border border-rose-200 px-4 py-2 text-xs text-rose-700 hover:bg-rose-50"
                    title="Apagar tudo (ação irreversível)"
                  >
                    Limpar
                  </button>
                </div>
              }
            >
          {/* IMPORTAÇÃO CSV */}
          {isImportOpen && (
            <div className="mb-4 grid gap-3 rounded-2xl border p-4">
              <div>
                <p className="text-sm font-medium">Importar extrato (CSV)</p>
                <p className="text-sm text-slate-500">
                  O app lê o arquivo e você escolhe quais colunas são{" "}
                  <b>Data</b>, <b>Descrição</b> e <b>Valor</b>.
                </p>
              </div>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleCSVFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />

              {importStatus === "reading" && (
                <p className="text-sm text-slate-500">Lendo arquivo…</p>
              )}

              {importStatus === "error" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {importError}
                </div>
              )}

              {(importStatus === "mapping" || importStatus === "ready") &&
                csvHeaders.length > 0 && (
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Coluna Data</label>
                        <select
                          value={mapDateIdx}
                          onChange={(e) => setMapDateIdx(Number(e.target.value))}
                          className="rounded-lg border px-3 py-2"
                        >
                          {csvHeaders.map((h, idx) => (
                            <option key={h + idx} value={idx}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium">
                          Coluna Descrição
                        </label>
                        <select
                          value={mapDescIdx}
                          onChange={(e) => setMapDescIdx(Number(e.target.value))}
                          className="rounded-lg border px-3 py-2"
                        >
                          {csvHeaders.map((h, idx) => (
                            <option key={h + idx} value={idx}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Coluna Valor</label>
                        <select
                          value={mapValueIdx}
                          onChange={(e) =>
                            setMapValueIdx(Number(e.target.value))
                          }
                          className="rounded-lg border px-3 py-2"
                        >
                          {csvHeaders.map((h, idx) => (
                            <option key={h + idx} value={idx}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-600">
                        Separador detectado: <b>{csvDelimiter}</b> · Prévia:{" "}
                        <b>{importPreview.length}</b> linhas (mostrando até 200)
                      </p>
                      <button
                        onClick={() => void importPreviewIntoApp()}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                      >
                        Importar agora
                      </button>
                    </div>

                    {importPreview.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Não consegui montar a prévia. Troque o mapeamento das
                        colunas (Data/Descrição/Valor) até aparecerem linhas.
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-auto rounded-xl border">
                        {importPreview.slice(0, 50).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between border-b p-3 last:border-b-0"
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
                              {t.type === "entrada" ? "+" : "-"}{" "}
                              {formatBRL(t.amount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
            </div>
          )}

          {/* FILTROS */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
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
                disabled={categoriesLoading}
              >
                <option value="todas">Todas</option>
                {categoriesForSelect.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Buscar</label>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-lg border px-3 py-2"
                placeholder="Ex: Mercado"
              />
            </div>
          </div>

          {(transactionsLoading || categoriesLoading) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Carregando dados do backend...
            </div>
          )}

          {(transactionsError || categoriesError) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {transactionsError ?? categoriesError}
            </div>
          )}

          {/* FORM (manual) */}
          {isFormOpen && (
            <div className="mb-4 grid gap-3 rounded-2xl border p-4">
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
                  {categoriesForSelect.map((c) => (
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

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleSave()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                >
                  {editingId ? "Atualizar" : "Salvar"}
                </button>

                {editingId && (
                  <button
                    onClick={cancelEdit}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mb-4 grid gap-3 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Categorias personalizadas</p>
                <p className="text-sm text-slate-500">
                  Adicione categorias novas para classificar transações e
                  melhorar a importação automática.
                </p>
              </div>
              <button
                onClick={() => void resetCategories()}
                className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
              >
                Restaurar padrão
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => void removeCategory(c)}
                  className={
                    "rounded-full border px-3 py-1 text-xs " +
                    (c === "Outros"
                      ? "cursor-not-allowed bg-slate-50 text-slate-400"
                      : "hover:bg-slate-50")
                  }
                  title={c === "Outros" ? "Categoria padrão" : "Remover"}
                  disabled={c === "Outros"}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder="Nova categoria"
              />
              <button
                onClick={() => void handleAddCategory()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* LISTA */}
          {filteredTransactions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Nenhuma transação encontrada</p>
              <p className="mt-1 text-sm text-slate-500">
                Tente mudar os filtros, importar um CSV ou cadastrar uma nova.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {t.date} · {t.category}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
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

                    <select
                      value={t.category}
                      onChange={(e) =>
                        void handleUpdateTransaction({
                          ...t,
                          category: e.target.value as Category,
                        })
                      }
                      className="rounded-lg border px-2 py-1 text-xs"
                      aria-label="Alterar categoria"
                    >
                      {categoriesForSelect.map((c) => (
                        <option key={`${t.id}-${c}`} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => void handleAutoSuggestCategory(t)}
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      title="Sugerir categoria automaticamente"
                    >
                      Auto
                    </button>

                    <button
                      onClick={() => startEdit(t)}
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      title="Editar"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => void handleRemoveTransaction(t.id)}
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
      </div>
    </div>
  );
}
