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

const STORAGE_KEY = "cf_transactions_v7";

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

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeHeader(s: string) {
  return normalizeSpaces(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toISODate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY
  const br = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(/[R$\s]/g, "");

  // 1.234,56
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // 123,45 ou 123.45
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function splitCSVLine(line: string, delimiter: "," | ";") {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" vira "
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => v.trim());
}

function detectDelimiterFromLine(line: string): "," | ";" {
  const semis = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semis >= commas ? ";" : ",";
}

function makeSignature(t: {
  date: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: Category;
}) {
  return `${t.date}|${normalizeSpaces(t.title).toLowerCase()}|${t.amount.toFixed(
    2
  )}|${t.type}|${t.category}`;
}

function guessColumnIndex(headers: string[], kind: "date" | "desc" | "value") {
  const h = headers.map(normalizeHeader);

  const findAny = (needles: string[]) => {
    for (let i = 0; i < h.length; i++) {
      for (const n of needles) {
        if (h[i].includes(n)) return i;
      }
    }
    return -1;
  };

  if (kind === "date") return findAny(["data", "date", "lancamento"]);
  if (kind === "desc")
    return findAny(["descricao", "descr", "historico", "hist", "memo"]);
  return findAny(["valor", "value", "amount", "debito", "credito"]);
}

function pickHeaderLineIndex(lines: string[], delimiter: "," | ";") {
  // procura a linha que realmente é o header:
  // - tem >= 3 colunas
  // - tem palavras chave tipo data/valor/descricao/historico/saldo
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const cols = splitCSVLine(lines[i], delimiter);
    if (cols.length < 3) continue;

    const nonEmpty = cols.filter((c) => c.trim().length > 0).length;
    const joined = cols.map(normalizeHeader).join(" ");

    const hasKeywords =
      joined.includes("data") ||
      joined.includes("valor") ||
      joined.includes("descricao") ||
      joined.includes("historico") ||
      joined.includes("saldo");

    const score = cols.length + nonEmpty + (hasKeywords ? 10 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
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

  // FORM (manual)
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

  // IMPORT CSV (mapeamento)
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<
    "idle" | "reading" | "mapping" | "ready" | "error"
  >("idle");
  const [importError, setImportError] = useState<string>("");

  const [csvDelimiter, setCsvDelimiter] = useState<"," | ";">(";");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);

  const [mapDateIdx, setMapDateIdx] = useState<number>(-1);
  const [mapDescIdx, setMapDescIdx] = useState<number>(-1);
  const [mapValueIdx, setMapValueIdx] = useState<number>(-1);

  const [importPreview, setImportPreview] = useState<Transaction[]>([]);

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
    setIsImportOpen(false);
    setImportPreview([]);
    setImportStatus("idle");
    setImportError("");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapDateIdx(-1);
    setMapDescIdx(-1);
    setMapValueIdx(-1);
  }

  async function handleCSVFile(file: File | null) {
    if (!file) return;

    setImportError("");
    setImportStatus("reading");
    setImportPreview([]);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapDateIdx(-1);
    setMapDescIdx(-1);
    setMapValueIdx(-1);

    try {
      const text = await file.text();

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error("CSV com poucas linhas. Precisa ter header + dados.");
      }

      // Delimitador pelo primeiro pedaço do arquivo
      const delimiter = detectDelimiterFromLine(lines[0]);
      setCsvDelimiter(delimiter);

      // Acha o header verdadeiro (ignora "Extrato Conta Corrente" e similares)
      const headerIdx = pickHeaderLineIndex(lines, delimiter);

      const headers = splitCSVLine(lines[headerIdx], delimiter).map((h) =>
        normalizeSpaces(h)
      );

      const rows = lines
        .slice(headerIdx + 1)
        .map((line) => splitCSVLine(line, delimiter))
        .filter((r) => r.filter((c) => c.trim()).length >= 3);

      setCsvHeaders(headers);
      setCsvRows(rows);

      // sugestões automáticas
      const guessDate = guessColumnIndex(headers, "date");
      const guessDesc = guessColumnIndex(headers, "desc");
      const guessValue = guessColumnIndex(headers, "value");

      setMapDateIdx(guessDate >= 0 ? guessDate : 0);
      setMapDescIdx(guessDesc >= 0 ? guessDesc : Math.min(1, headers.length - 1));
      setMapValueIdx(guessValue >= 0 ? guessValue : Math.min(2, headers.length - 1));

      setImportStatus("mapping");
    } catch (e) {
      setImportStatus("error");
      setImportError(e instanceof Error ? e.message : "Erro ao ler CSV");
    }
  }

  // gera preview ao mudar mapeamento
  useEffect(() => {
    if (importStatus !== "mapping" && importStatus !== "ready") return;
    if (csvHeaders.length === 0 || csvRows.length === 0) return;
    if (mapDateIdx < 0 || mapDescIdx < 0 || mapValueIdx < 0) return;

    const preview: Transaction[] = [];

    for (let i = 0; i < csvRows.length; i++) {
      const cols = csvRows[i];
      const rawDate = cols[mapDateIdx] ?? "";
      const rawDesc = cols[mapDescIdx] ?? "";
      const rawValue = cols[mapValueIdx] ?? "";

      const isoDate = toISODate(rawDate);
      const amt = parseAmount(rawValue);

      if (!isoDate || amt === null) continue;

      const txType: TransactionType = amt >= 0 ? "entrada" : "saida";

      preview.push({
        id: crypto.randomUUID(),
        type: txType,
        title: normalizeSpaces(rawDesc) || "Sem descrição",
        amount: Math.abs(amt),
        date: isoDate,
        category: "Outros",
      });

      if (preview.length >= 200) break;
    }

    setImportPreview(preview);
    setImportStatus(preview.length > 0 ? "ready" : "mapping");
  }, [importStatus, csvHeaders, csvRows, mapDateIdx, mapDescIdx, mapValueIdx]);

  function importPreviewIntoApp() {
    if (importPreview.length === 0) {
      alert("Prévia vazia. Ajuste o mapeamento (Data/Descrição/Valor).");
      return;
    }

    const existing = new Set(
      transactions.map((t) =>
        makeSignature({
          date: t.date,
          title: t.title,
          amount: t.amount,
          type: t.type,
          category: t.category,
        })
      )
    );

    const toAdd: Transaction[] = [];
    for (const t of importPreview) {
      const sig = makeSignature({
        date: t.date,
        title: t.title,
        amount: t.amount,
        type: t.type,
        category: t.category,
      });
      if (!existing.has(sig)) {
        existing.add(sig);
        toAdd.push(t);
      }
    }

    if (toAdd.length === 0) {
      alert("Nada novo para importar (evitei duplicadas).");
      return;
    }

    setTransactions((prev) => [...toAdd, ...prev]);
    alert(`Importei ${toAdd.length} transações!`);

    setIsImportOpen(false);
    setImportPreview([]);
    setImportStatus("idle");
    setImportError("");
    setCsvHeaders([]);
    setCsvRows([]);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Controle Financeiro</h1>
            <p className="text-sm text-slate-500">
              MVP · Entradas, Saídas, Categorias e Importação CSV (mapeamento)
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
                onClick={() => setIsImportOpen((v) => !v)}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                title="Importar extrato"
              >
                Importar CSV
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
                        onClick={importPreviewIntoApp}
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
                Tente mudar os filtros, importar um CSV ou cadastrar uma nova.
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
