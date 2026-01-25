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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email?: string | null;
  } | null>(null);

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
  const [monthsToShow, setMonthsToShow] = useState(3);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

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
    const THEME_KEY = "cf_theme";
    const storedTheme = localStorage.getItem(THEME_KEY);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const initialDark =
      storedTheme === "dark" ? true : storedTheme === "light" ? false : mediaQuery.matches;

    setIsDarkMode(initialDark);

    const handleChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY)) return;
      setIsDarkMode(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  function toggleTheme() {
    const next = !isDarkMode;
    localStorage.setItem("cf_theme", next ? "dark" : "light");
    setIsDarkMode(next);
  }

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthReady(true);
      return;
    }

    requestJson<{ id: string; name: string; email?: string | null }>(
      "/api/auth/me"
    )
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
  const categoryPalette = useMemo(
    () => [
      { dotClass: "app-chart-income", color: "var(--success-main)" },
      { dotClass: "app-chart-expense", color: "var(--danger-main)" },
      { dotClass: "app-chart-info", color: "var(--info-main)" },
      { dotClass: "app-chart-warning", color: "var(--warning-main)" },
      { dotClass: "app-chart-primary", color: "var(--primary-main)" },
      { dotClass: "app-chart-secondary", color: "var(--text-secondary)" },
      { dotClass: "app-chart-muted", color: "var(--text-muted)" },
      { dotClass: "app-chart-border", color: "var(--border-default)" },
    ],
    []
  );
  const { totalExpenseAmount, categoryPieStops } = useMemo(() => {
    const totalExpense = totalsByCategory.reduce(
      (acc, [, total]) => acc + total,
      0
    );
    if (totalExpense <= 0) {
      return { totalExpenseAmount: 0, categoryPieStops: [] };
    }

    let current = 0;
    const stops = totalsByCategory.map(([category, total], index) => {
      const percentage = (total / totalExpense) * 100;
      const start = current;
      current += percentage;
      const palette = categoryPalette[index % categoryPalette.length];
      return {
        category,
        total,
        start,
        end: current,
        dotClass: palette.dotClass,
        color: palette.color,
      };
    });

    return { totalExpenseAmount: totalExpense, categoryPieStops: stops };
  }, [categoryPalette, totalsByCategory]);

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
  const visibleMonthlyTotals = useMemo(
    () => monthlyTotalsByType.slice(-monthsToShow),
    [monthlyTotalsByType, monthsToShow]
  );
  const maxMonthValue = Math.max(
    ...visibleMonthlyTotals.map((m) => Math.max(m.income, m.expense)),
    0
  );
  const balanceTone =
    summary.balance > 0
      ? "text-[color:var(--success-main)]"
      : summary.balance < 0
      ? "text-[color:var(--danger-main)]"
      : "app-text-muted";
  const categoryIcons: Record<string, string> = {
    Alimentação: "🍽️",
    Mercado: "🛒",
    Transporte: "🚌",
    Moradia: "🏠",
    Saúde: "🩺",
    Educação: "📚",
    Lazer: "🎮",
    Viagem: "✈️",
    Trabalho: "💼",
    Assinaturas: "🧾",
    Investimentos: "📈",
    Outros: "🏷️",
  };

  function getCategoryIcon(categoryName: string) {
    return categoryIcons[categoryName] ?? "🏷️";
  }

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

  function openFormWithType(nextType: TransactionType) {
    setEditingId(null);
    resetForm();
    setType(nextType);
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
        user: { id: string; name: string; email?: string | null };
      }>("/api/auth/login", {
        method: "POST",
        body: { name: authUsername, password: authPassword },
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
        body: { name: authUsername, password: authPassword },
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
      <div className="app-bg-primary app-bg-gradient app-text-secondary flex min-h-screen items-center justify-center">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-bg-primary app-bg-gradient app-text-primary min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 py-12 lg:flex-row">
          <div className="w-full max-w-md space-y-4">
            <div
              className="rounded-3xl p-6 text-white shadow-lg"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, var(--primary-main), var(--info-main), var(--success-main))",
              }}
            >
              <h1 className="text-2xl font-semibold">Controle Financeiro</h1>
              <p className="mt-2 text-sm text-white/90">
                Entre para acompanhar seus gastos com segurança.
              </p>
            </div>
            <div className="app-bg-secondary app-border rounded-3xl border p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 rounded-full px-4 py-2 text-sm ${
                      authMode === "login"
                        ? "app-btn-primary"
                        : "app-btn-outline border"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className={`flex-1 rounded-full px-4 py-2 text-sm ${
                      authMode === "register"
                        ? "app-btn-primary"
                        : "app-btn-outline border"
                    }`}
                  >
                    Criar conta
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="app-btn-outline rounded-full border px-3 py-1 text-xs"
                >
                  {isDarkMode ? "Modo claro" : "Modo escuro"}
                </button>
              </div>

              {authMode === "login" ? (
                <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <label className="app-text-muted text-xs font-medium uppercase">
                      Usuário
                    </label>
                    <input
                      type="text"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary w-full rounded-xl border px-3 py-2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="app-text-muted text-xs font-medium uppercase">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary w-full rounded-xl border px-3 py-2"
                      required
                    />
                  </div>
                  {authError && (
                    <div className="rounded-xl border px-3 py-2 text-sm text-[color:var(--danger-main)]" style={{ borderColor: "var(--danger-main)", backgroundColor: "color-mix(in srgb, var(--danger-main) 10%, transparent)" }}>
                      {authError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="app-btn-primary w-full rounded-xl px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {authLoading ? "Entrando..." : "Entrar"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <label className="app-text-muted text-xs font-medium uppercase">
                      Usuário
                    </label>
                    <input
                      type="text"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary w-full rounded-xl border px-3 py-2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="app-text-muted text-xs font-medium uppercase">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary w-full rounded-xl border px-3 py-2"
                      required
                    />
                  </div>
                  {authError && (
                    <div className="rounded-xl border px-3 py-2 text-sm text-[color:var(--danger-main)]" style={{ borderColor: "var(--danger-main)", backgroundColor: "color-mix(in srgb, var(--danger-main) 10%, transparent)" }}>
                      {authError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="app-btn-primary w-full rounded-xl px-4 py-2 text-sm disabled:opacity-60"
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
    <div className="app-bg-primary app-bg-gradient app-text-primary min-h-screen">
      <div className="flex min-h-screen">
        <aside className="app-bg-secondary hidden w-20 flex-col items-center gap-6 py-6 shadow-sm md:flex">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: "var(--primary-main)" }}
          >
            $
          </div>
          <nav className="app-text-muted flex flex-col gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: "color-mix(in srgb, var(--primary-main) 12%, transparent)", color: "var(--primary-main)" }}>
              ⌁
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-[var(--bg-tertiary)]">
              📈
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-[var(--bg-tertiary)]">
              📂
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-[var(--bg-tertiary)]">
              ⚙️
            </span>
          </nav>
        </aside>

        <div className="flex-1">
          <header className="app-border app-bg-secondary sticky top-0 z-10 border-b/60 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h1 className="text-xl font-semibold">Dashboard</h1>
                <p className="app-text-secondary text-sm">
                  Bem-vindo(a), {user.name}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="app-bg-secondary app-border app-text-secondary rounded-full border px-3 py-1 text-xs">
                  {monthLabel}
                </span>
                <button
                  onClick={handleLogout}
                  className="app-btn-outline rounded-full border px-3 py-1 text-xs"
                >
                  Sair
                </button>
                <button
                  onClick={toggleTheme}
                  className="app-btn-outline rounded-full border px-3 py-1 text-xs"
                >
                  {isDarkMode ? "Modo claro" : "Modo escuro"}
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl space-y-8 px-4 pb-28 pt-8 sm:px-6">
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <Card
                title="Quanto você tem disponível"
                className="md:col-span-2 xl:col-span-2"
              >
                <p className={`text-3xl font-semibold sm:text-4xl ${balanceTone}`}>
                  {formatBRL(summary.balance)}
                </p>
                <p className="app-text-muted mt-2 text-sm">
                  Saldo consolidado do mês em andamento.
                </p>
              </Card>
              <Card title="O que entrou">
                <p className="text-2xl font-semibold text-[color:var(--success-main)]">
                  {formatBRL(summary.income)}
                </p>
                <p className="app-text-muted mt-2 text-sm">Entradas deste mês</p>
              </Card>
              <Card title="O que saiu">
                <p className="text-2xl font-semibold text-[color:var(--danger-main)]">
                  {formatBRL(summary.expense)}
                </p>
                <p className="app-text-muted mt-2 text-sm">Pagamentos deste mês</p>
              </Card>
              <Card title="Categorias ativas">
                <p className="text-2xl font-semibold app-text-primary">
                  {categoriesForSelect.length}
                </p>
                <p className="app-text-muted mt-2 text-sm">Personalize como quiser</p>
              </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-[2fr,3fr]">
              <Card title="Onde seu dinheiro foi">
                <div className="grid gap-6 lg:grid-cols-[220px,1fr] lg:items-center">
                  <div className="flex items-center justify-center">
                    <div
                      className="relative h-44 w-44 rounded-full"
                      style={{
                        backgroundImage:
                          totalsByCategory.length === 0
                            ? "conic-gradient(var(--chart-grid) 0% 60%, color-mix(in srgb, var(--chart-grid) 60%, transparent) 60% 100%)"
                            : `conic-gradient(${categoryPieStops
                                .map(
                                  (slice) =>
                                    `${slice.color} ${slice.start}% ${slice.end}%`
                                )
                                .join(",")})`,
                      }}
                    >
                      <div className="app-card-surface absolute inset-6 rounded-full border" style={{ borderColor: "color-mix(in srgb, var(--border-default) 60%, transparent)" }} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="app-text-muted text-xs">
                          {totalsByCategory.length === 0 ? "Sem gastos ainda" : "Total"}
                        </span>
                        <span className="app-text-primary text-sm font-semibold">
                          {formatBRL(totalExpenseAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {totalsByCategory.length === 0 ? (
                      <div className="app-text-muted space-y-3 text-sm">
                        <p>
                          Adicione seus primeiros gastos para ver insights aqui.
                        </p>
                        <button
                          type="button"
                          onClick={() => openFormWithType("saida")}
                          className="app-btn-primary rounded-full px-4 py-2 text-xs"
                        >
                          Adicionar gasto
                        </button>
                      </div>
                    ) : (
                      totalsByCategory.map(([cat, total], index) => {
                        const percentage =
                          maxCategoryTotal > 0
                            ? (total / maxCategoryTotal) * 100
                            : 0;
                        const palette =
                          categoryPalette[index % categoryPalette.length];
                        return (
                          <div key={cat} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className={`h-3 w-3 rounded-full ${palette.dotClass}`} />
                                <span className="font-medium">{cat}</span>
                              </div>
                              <span className="app-text-secondary">
                                {formatBRL(total)}
                              </span>
                            </div>
                            <div className="app-chart-grid h-2 rounded-full">
                              <div
                                className="h-2 rounded-full app-chart-income"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </Card>

              <Card title={`Resumo mensal (últimos ${monthsToShow} meses)`}>
                <div className="space-y-5">
                  <div className="app-text-muted flex flex-wrap items-center justify-between gap-3 text-xs">
                    <p>Veja a tendência de entradas e saídas rapidamente.</p>
                    <div className="flex items-center gap-3">
                      {[3, 6, 12].map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setMonthsToShow(option)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                            monthsToShow === option
                              ? "app-btn-primary"
                              : "app-btn-outline border"
                          }`}
                        >
                          {option} meses
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="app-text-muted flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full app-chart-income" />
                      <span>O que entrou</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full app-chart-expense" />
                      <span>O que saiu</span>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6 lg:grid-cols-12">
                      {visibleMonthlyTotals.map((m) => {
                        const incomeHeight =
                          maxMonthValue > 0 ? (m.income / maxMonthValue) * 100 : 0;
                        const expenseHeight =
                          maxMonthValue > 0 ? (m.expense / maxMonthValue) * 100 : 0;

                        return (
                          <div key={m.key} className="flex flex-col items-center gap-2">
                            <div className="flex h-32 items-end gap-2">
                              <div className="app-chart-grid flex h-full items-end rounded-full px-1">
                                <div
                                  className="w-3 rounded-full app-chart-income"
                                  style={{ height: `${incomeHeight}%` }}
                                />
                              </div>
                              <div className="app-chart-grid flex h-full items-end rounded-full px-1">
                                <div
                                  className="w-3 rounded-full app-chart-expense"
                                  style={{ height: `${expenseHeight}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-center text-[11px]">
                              <p className="app-text-secondary font-medium">{m.label}</p>
                              <p className="app-text-muted">
                                {formatBRL(m.income)} · {formatBRL(m.expense)}
                              </p>
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
                    className="app-btn-primary rounded-full px-4 py-2 text-xs"
                  >
                    {isFormOpen ? "Fechar" : "+ Nova"}
                  </button>

                  <button
                    onClick={() =>
                      isImportOpen ? closeImport() : setIsImportOpen(true)
                    }
                    className="app-btn-outline rounded-full border px-4 py-2 text-xs"
                    title="Importar extrato"
                  >
                    Importar CSV
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="app-btn-outline rounded-full border px-4 py-2 text-xs"
                    title="Exportar transações filtradas"
                  >
                    Exportar CSV
                  </button>

                  <button
                    onClick={() => void clearAll()}
                    className="rounded-full border px-4 py-2 text-xs text-[color:var(--danger-main)]"
                    style={{ borderColor: "var(--danger-main)", backgroundColor: "transparent" }}
                    title="Apagar tudo (ação irreversível)"
                  >
                    Limpar
                  </button>
                </div>
              }
            >
              {/* IMPORTAÇÃO CSV */}
              {isImportOpen && (
                <div className="app-card-surface app-border mb-6 grid gap-3 rounded-2xl border p-4">
                  <div>
                    <p className="text-sm font-medium">Importar extrato (CSV)</p>
                    <p className="app-text-muted text-sm">
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
                    <p className="app-text-muted text-sm">Lendo arquivo…</p>
                  )}

                  {importStatus === "error" && (
                    <div
                      className="rounded-xl border p-3 text-sm text-[color:var(--danger-main)]"
                      style={{
                        borderColor: "var(--danger-main)",
                        backgroundColor:
                          "color-mix(in srgb, var(--danger-main) 10%, transparent)",
                      }}
                    >
                      {importError}
                    </div>
                  )}

                  {(importStatus === "mapping" || importStatus === "ready") &&
                    csvHeaders.length > 0 && (
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="grid gap-2">
                            <label className="text-sm font-medium">
                              Coluna Data
                            </label>
                            <select
                              value={mapDateIdx}
                              onChange={(e) =>
                                setMapDateIdx(Number(e.target.value))
                              }
                              className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
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
                              onChange={(e) =>
                                setMapDescIdx(Number(e.target.value))
                              }
                              className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
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
                              Coluna Valor
                            </label>
                            <select
                              value={mapValueIdx}
                              onChange={(e) =>
                                setMapValueIdx(Number(e.target.value))
                              }
                              className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
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
                          <p className="app-text-secondary text-sm">
                            Separador detectado: <b>{csvDelimiter}</b> · Prévia:{" "}
                            <b>{importPreview.length}</b> linhas (mostrando até
                            200)
                          </p>
                          <button
                            onClick={() => void importPreviewIntoApp()}
                            className="rounded-xl px-4 py-2 text-sm text-white"
                            style={{ backgroundColor: "var(--success-main)" }}
                          >
                            Importar agora
                          </button>
                        </div>

                        {importPreview.length === 0 ? (
                          <div
                            className="rounded-xl border p-3 text-sm text-[color:var(--warning-main)]"
                            style={{
                              borderColor: "var(--warning-main)",
                              backgroundColor:
                                "color-mix(in srgb, var(--warning-main) 10%, transparent)",
                            }}
                          >
                            Não consegui montar a prévia. Troque o mapeamento das
                            colunas (Data/Descrição/Valor) até aparecerem linhas.
                          </div>
                        ) : (
                          <div className="app-border max-h-64 overflow-auto rounded-xl border">
                            {importPreview.slice(0, 50).map((t) => (
                              <div
                                key={t.id}
                                className="app-border flex items-center justify-between border-b p-3 last:border-b-0"
                              >
                                <div>
                                  <p className="font-medium">{t.title}</p>
                                  <p className="app-text-muted text-xs">
                                    {t.date}
                                  </p>
                                </div>

                                <p
                                  className={
                                    "font-semibold " +
                                    (t.type === "entrada"
                                      ? "text-[color:var(--success-main)]"
                                      : "text-[color:var(--danger-main)]")
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
              <div className="app-card-surface app-border mb-6 grid gap-4 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { value: "todos", label: "Todos" },
                      { value: "entrada", label: "Entradas" },
                      { value: "saida", label: "Saídas" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFilterType(
                            option.value as "todos" | TransactionType
                          )
                        }
                        className={`rounded-full px-4 py-2 text-xs font-medium ${
                          filterType === option.value
                            ? "app-btn-primary"
                            : "app-btn-outline border"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary rounded-full border px-4 py-2 text-xs"
                      placeholder="Buscar por nome ou categoria"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters((prev) => !prev)}
                      className="app-btn-outline rounded-full border px-4 py-2 text-xs"
                    >
                      {showAdvancedFilters
                        ? "Ocultar filtros"
                        : "Filtros avançados"}
                    </button>
                  </div>
                </div>

                {showAdvancedFilters && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">
                        Filtrar por categoria
                      </label>
                      <select
                        value={filterCategory}
                        onChange={(e) =>
                          setFilterCategory(e.target.value as "todas" | Category)
                        }
                        className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
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
                  </div>
                )}
              </div>

              {(transactionsLoading || categoriesLoading) && (
                <div className="app-bg-tertiary app-border app-text-secondary rounded-xl border px-4 py-3 text-sm">
                  Carregando dados do backend...
                </div>
              )}

              {(transactionsError || categoriesError) && (
                <div
                  className="rounded-xl border px-4 py-3 text-sm text-[color:var(--danger-main)]"
                  style={{
                    borderColor: "var(--danger-main)",
                    backgroundColor:
                      "color-mix(in srgb, var(--danger-main) 10%, transparent)",
                  }}
                >
                  {transactionsError ?? categoriesError}
                </div>
              )}

              {/* FORM (manual) */}
              {isFormOpen && (
                <div className="app-card-surface app-border mb-6 grid gap-3 rounded-2xl border p-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Título</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
                      placeholder="Ex: Mercado"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Valor</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
                      placeholder="Ex: 150"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Tipo</label>
                    <select
                      value={type}
                      onChange={(e) =>
                        setType(e.target.value as TransactionType)
                      }
                      className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
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
                      className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
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
                      className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleSave()}
                      className="rounded-xl px-4 py-2 text-sm text-white"
                      style={{ backgroundColor: "var(--success-main)" }}
                    >
                      {editingId ? "Atualizar" : "Salvar"}
                    </button>

                    {editingId && (
                      <button
                        onClick={cancelEdit}
                        className="app-btn-outline rounded-xl border px-4 py-2 text-sm"
                      >
                        Cancelar edição
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="app-card-surface app-border mb-6 grid gap-4 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      Categorias personalizadas
                    </p>
                    <p className="app-text-muted text-sm">
                      Adicione categorias novas para classificar transações e
                      melhorar a importação automática.
                    </p>
                  </div>
                  <button
                    onClick={() => void resetCategories()}
                    className="app-btn-outline rounded-xl border px-3 py-1 text-xs"
                  >
                    Restaurar padrão
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => void removeCategory(c)}
                      className={
                        "flex min-h-[44px] items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm " +
                        (c === "Outros"
                          ? "cursor-not-allowed app-bg-tertiary app-text-muted"
                          : "app-btn-outline")
                      }
                      title={c === "Outros" ? "Categoria padrão" : "Remover"}
                      disabled={c === "Outros"}
                    >
                      <span className="text-lg">{getCategoryIcon(c)}</span>
                      <span className="font-medium">{c}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    className="app-bg-secondary app-border app-text-primary rounded-lg border px-3 py-2 text-sm"
                    placeholder="Nova categoria"
                  />
                  <button
                    onClick={() => void handleAddCategory()}
                    className="app-btn-primary rounded-xl px-4 py-2 text-sm"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {/* LISTA */}
              {filteredTransactions.length === 0 ? (
                <div className="app-card-surface app-border rounded-2xl border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">
                    Comece adicionando sua primeira transação 🎯
                  </p>
                  <p className="app-text-muted mt-2 text-sm">
                    Registre entradas e saídas para acompanhar seu orçamento com
                    clareza.
                  </p>
                  <button
                    type="button"
                    onClick={() => openFormWithType("entrada")}
                    className="app-btn-primary mt-4 rounded-full px-5 py-2 text-xs"
                  >
                    Adicionar transação
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransactions.map((t) => (
                    <div
                      key={t.id}
                      className="app-card-surface app-border flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{t.title}</p>
                        <p className="app-text-muted text-xs">
                          {t.date} · {t.category}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={
                            "font-semibold " +
                            (t.type === "entrada"
                              ? "text-[color:var(--success-main)]"
                              : "text-[color:var(--danger-main)]")
                          }
                        >
                          {t.type === "entrada" ? "+" : "-"}{" "}
                          {formatBRL(t.amount)}
                        </p>

                        <select
                          value={t.category}
                          onChange={(e) =>
                            void handleUpdateTransaction({
                              ...t,
                              category: e.target.value as Category,
                            })
                          }
                          className="app-bg-secondary app-border app-text-primary rounded-lg border px-2 py-1 text-xs"
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
                          className="app-btn-outline rounded-lg border px-3 py-1 text-xs"
                          title="Sugerir categoria automaticamente"
                        >
                          Auto
                        </button>

                        <button
                          onClick={() => startEdit(t)}
                          className="app-btn-outline rounded-lg border px-3 py-1 text-xs"
                          title="Editar"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => void handleRemoveTransaction(t.id)}
                          className="app-btn-outline rounded-lg border px-3 py-1 text-xs"
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

          <div className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-3">
            <button
              type="button"
              onClick={() => openFormWithType("entrada")}
              className="app-btn-primary rounded-full px-5 py-3 text-sm shadow-lg"
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => openFormWithType("saida")}
              className="rounded-full px-5 py-3 text-sm text-white shadow-lg"
              style={{ backgroundColor: "var(--danger-main)" }}
            >
              Pagar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
