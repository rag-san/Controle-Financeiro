import { useMemo, useState } from "react";
import { Card } from "./components/Card";
import { useCategories } from "./hooks/useCategories";
import { useCsvImport } from "./hooks/useCsvImport";
import { useTransactions } from "./hooks/useTransactions";
import { suggestCategoryWithAI } from "./utils/ai";
import {
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    addTransaction,
    updateTransaction,
    removeTransaction,
    clearTransactions,
    importTransactions,
  } = useTransactions();

  // FORM (manual)
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("entrada");
  const [category, setCategory] = useState<Category>("Outros");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryInput, setCategoryInput] = useState("");
  const [aiBusyIds, setAiBusyIds] = useState<Record<string, boolean>>({});

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
  } = useCategories();

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

  const monthlyTotals = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
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

    const totals = new Map(months.map((m) => [m.key, 0]));
    for (const t of filteredTransactions) {
      if (t.type !== "saida") continue;
      const key = t.date.slice(0, 7);
      if (totals.has(key)) {
        totals.set(key, (totals.get(key) ?? 0) + t.amount);
      }
    }

    return months.map((m) => ({
      ...m,
      total: totals.get(m.key) ?? 0,
    }));
  }, [filteredTransactions]);

  const maxCategoryTotal =
    totalsByCategory.length > 0 ? totalsByCategory[0][1] : 0;
  const maxMonthTotal = Math.max(...monthlyTotals.map((m) => m.total), 0);
  const balanceTone =
    summary.balance > 0
      ? "text-emerald-600"
      : summary.balance < 0
      ? "text-rose-600"
      : "text-slate-500";

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

  async function handleAiSuggestCategory(transaction: Transaction) {
    setAiBusyIds((prev) => ({ ...prev, [transaction.id]: true }));

    try {
      const suggested = await suggestCategoryWithAI({
        title: transaction.title,
        categories: categoriesForSelect,
      });

      await handleUpdateTransaction({
        ...transaction,
        category: suggested,
      });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível obter sugestão da IA."
      );
    } finally {
      setAiBusyIds((prev) => ({ ...prev, [transaction.id]: false }));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Controle Financeiro</h1>
            <p className="text-sm text-slate-500">
              MVP · Entradas, Saídas, Categorias e Importação CSV (mapeamento)
            </p>
          </div>

          <span className="w-fit text-xs rounded-full border px-3 py-1 text-slate-600">
            {monthLabel}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <Card title="Resultado do mês">
            <p className={`text-2xl font-bold ${balanceTone}`}>
              {formatBRL(summary.balance)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Entradas - Saídas (filtro atual)
            </p>
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
                    maxCategoryTotal > 0 ? (total / maxCategoryTotal) * 100 : 0;
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

          <Card title="Evolução de gastos (últimos 6 meses)">
            {monthlyTotals.every((m) => m.total === 0) ? (
              <p className="text-sm text-slate-500">
                Sem dados de gastos no período selecionado.
              </p>
            ) : (
              <div className="grid gap-3">
                {monthlyTotals.map((m) => {
                  const percentage =
                    maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0;
                  return (
                    <div key={m.key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-slate-500">
                          {formatBRL(m.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-sky-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        <Card
          title="Transações"
          right={
            <div className="flex flex-wrap gap-2">
              <button
                onClick={toggleForm}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 active:bg-slate-900"
              >
                {isFormOpen ? "Fechar" : "+ Nova"}
              </button>

              <button
                onClick={() =>
                  isImportOpen ? closeImport() : setIsImportOpen(true)
                }
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                title="Importar extrato"
              >
                Importar CSV
              </button>

              <button
                onClick={handleExportCsv}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                title="Exportar transações filtradas"
              >
                Exportar CSV
              </button>

              <button
                onClick={() => void clearAll()}
                className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50"
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
                      onClick={() => void handleAiSuggestCategory(t)}
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      disabled={aiBusyIds[t.id]}
                      title="Sugerir categoria com IA"
                    >
                      {aiBusyIds[t.id] ? "IA..." : "IA"}
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
  );
}
