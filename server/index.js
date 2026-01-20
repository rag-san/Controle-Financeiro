import "dotenv/config";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const apiKey = process.env.OPENAI_API_KEY;
const dataFile =
  process.env.DATA_FILE ?? path.join(process.cwd(), "data.json");

const DEFAULT_CATEGORIES = [
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

let cachedData = null;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function ensureDataFile() {
  try {
    await fs.access(dataFile);
  } catch {
    const initial = {
      transactions: [],
      categories: DEFAULT_CATEGORIES,
    };
    await fs.writeFile(dataFile, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function loadData() {
  if (cachedData) return cachedData;
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf-8");
  try {
    cachedData = JSON.parse(raw);
  } catch {
    cachedData = { transactions: [], categories: DEFAULT_CATEGORIES };
  }
  return cachedData;
}

async function saveData(next) {
  cachedData = next;
  await fs.writeFile(dataFile, JSON.stringify(next, null, 2), "utf-8");
}

function normalizeText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function makeSignature(transaction) {
  return [
    transaction.date,
    normalizeText(transaction.title),
    Number(transaction.amount).toFixed(2),
    transaction.type,
    normalizeText(transaction.category),
  ].join("|");
}

function ensureDefaultCategory(categories) {
  const normalized = new Map();
  for (const category of categories) {
    const key = normalizeText(category);
    if (!key) continue;
    if (!normalized.has(key)) {
      normalized.set(key, category);
    }
  }
  if (!normalized.has(normalizeText("Outros"))) {
    normalized.set(normalizeText("Outros"), "Outros");
  }
  return Array.from(normalized.values());
}

function findMatchingCategory(suggested, categories, fallback) {
  const normalizedSuggestion = normalizeText(suggested);
  if (!normalizedSuggestion) return fallback;

  const normalizedCategories = categories.map((category) => ({
    raw: category,
    normalized: normalizeText(category),
  }));

  const direct = normalizedCategories.find(
    (item) => item.normalized === normalizedSuggestion
  );

  if (direct) return direct.raw;

  const partial = normalizedCategories.find(
    (item) =>
      item.normalized && normalizedSuggestion.includes(item.normalized)
  );

  return partial?.raw ?? fallback;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/categories", async (_req, res) => {
  const data = await loadData();
  res.json({ categories: ensureDefaultCategory(data.categories ?? []) });
});

app.post("/api/categories", async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Categoria inválida." });
  }

  const data = await loadData();
  const categories = ensureDefaultCategory([
    ...(data.categories ?? DEFAULT_CATEGORIES),
    name.trim(),
  ]);

  await saveData({ ...data, categories });
  return res.json({ categories });
});

app.delete("/api/categories/:name", async (req, res) => {
  const name = req.params.name;
  if (!name) {
    return res.status(400).json({ error: "Categoria inválida." });
  }

  if (normalizeText(name) === normalizeText("Outros")) {
    return res.status(400).json({ error: "A categoria Outros é padrão." });
  }

  const data = await loadData();
  const filtered = ensureDefaultCategory(
    (data.categories ?? DEFAULT_CATEGORIES).filter(
      (category) => normalizeText(category) !== normalizeText(name)
    )
  );

  await saveData({ ...data, categories: filtered });
  return res.json({ categories: filtered });
});

app.post("/api/categories/reset", async (_req, res) => {
  const data = await loadData();
  await saveData({ ...data, categories: DEFAULT_CATEGORIES });
  return res.json({ categories: DEFAULT_CATEGORIES });
});

app.get("/api/transactions", async (_req, res) => {
  const data = await loadData();
  const list = Array.isArray(data.transactions) ? data.transactions : [];
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
  res.json(sorted);
});

app.post("/api/transactions", async (req, res) => {
  const payload = req.body ?? {};
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const data = await loadData();
  const transactions = Array.isArray(data.transactions)
    ? data.transactions
    : [];
  const next = {
    ...payload,
    id: payload.id ?? randomUUID(),
  };

  transactions.unshift(next);
  await saveData({ ...data, transactions });
  return res.json(next);
});

app.put("/api/transactions/:id", async (req, res) => {
  const id = req.params.id;
  const payload = req.body ?? {};
  if (!id || !payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const data = await loadData();
  const transactions = Array.isArray(data.transactions)
    ? data.transactions
    : [];
  const index = transactions.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Transação não encontrada." });
  }

  const updated = { ...payload, id };
  transactions[index] = updated;
  await saveData({ ...data, transactions });
  return res.json(updated);
});

app.delete("/api/transactions/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "Id inválido." });
  }

  const data = await loadData();
  const transactions = Array.isArray(data.transactions)
    ? data.transactions
    : [];
  const next = transactions.filter((t) => t.id !== id);
  await saveData({ ...data, transactions: next });
  return res.json({ ok: true });
});

app.delete("/api/transactions", async (_req, res) => {
  const data = await loadData();
  await saveData({ ...data, transactions: [] });
  return res.json({ ok: true });
});

app.post("/api/transactions/import", async (req, res) => {
  const { transactions } = req.body ?? {};
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const data = await loadData();
  const current = Array.isArray(data.transactions) ? data.transactions : [];
  const existing = new Set(current.map(makeSignature));
  const toAdd = [];

  for (const transaction of transactions) {
    if (!transaction) continue;
    const signature = makeSignature(transaction);
    if (existing.has(signature)) continue;
    existing.add(signature);
    toAdd.push({
      ...transaction,
      id: transaction.id ?? randomUUID(),
    });
  }

  const next = [...toAdd, ...current];
  await saveData({ ...data, transactions: next });
  return res.json({ added: toAdd.length });
});

app.post("/suggest-category", async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
  }

  const { title, categories } = req.body ?? {};

  if (typeof title !== "string" || !Array.isArray(categories)) {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const fallback = categories.includes("Outros") ? "Outros" : categories[0];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Você recebe uma descrição de gasto e uma lista de categorias. Responda somente com o nome de uma categoria da lista. Se não houver correspondência clara, responda 'Outros'.",
          },
          {
            role: "user",
            content: `Descrição: ${title}\nCategorias: ${categories.join(", ")}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(500).json({
        error: "Falha ao consultar a OpenAI.",
        details: details || undefined,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const category = findMatchingCategory(content, categories, fallback);

    return res.json({ category });
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao sugerir categoria.",
      details: error instanceof Error ? error.message : undefined,
    });
  }
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
