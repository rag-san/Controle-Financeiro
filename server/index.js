import "dotenv/config";
import cors from "cors";
import express from "express";
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
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
    const initial = buildInitialData();
    await fs.writeFile(dataFile, JSON.stringify(initial, null, 2), "utf-8");
  }
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const hashed = hashPassword(password, salt);
  const a = Buffer.from(hashed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function buildInitialData() {
  return {
    users: [],
    sessions: [],
    dataByUser: {},
  };
}

async function loadData() {
  if (cachedData) return cachedData;
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf-8");
  try {
    cachedData = JSON.parse(raw);
  } catch {
    cachedData = buildInitialData();
  }
  if (!cachedData.users) {
    const legacyTransactions = Array.isArray(cachedData.transactions)
      ? cachedData.transactions
      : [];
    const legacyCategories = Array.isArray(cachedData.categories)
      ? cachedData.categories
      : DEFAULT_CATEGORIES;
    cachedData = {
      users: [],
      sessions: [],
      dataByUser: {
        legacy: {
          transactions: legacyTransactions,
          categories: ensureDefaultCategory(legacyCategories),
        },
      },
    };
    await saveData(cachedData);
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

function getUserData(data, userId) {
  if (!data.dataByUser[userId]) {
    data.dataByUser[userId] = {
      transactions: [],
      categories: DEFAULT_CATEGORIES,
    };
  }
  return data.dataByUser[userId];
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Não autorizado." });
  }

  loadData()
    .then((data) => {
      const session = data.sessions?.find((item) => item.token === token);
      if (!session) {
        return res.status(401).json({ error: "Sessão inválida." });
      }
      req.userId = session.userId;
      next();
    })
    .catch(() => res.status(500).json({ error: "Erro de autenticação." }));
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!email || !password || typeof email !== "string") {
    return res.status(400).json({ error: "Dados inválidos." });
  }

  const data = await loadData();
  const normalizedEmail = normalizeText(email);
  const exists = data.users.some(
    (user) => normalizeText(user.email) === normalizedEmail
  );
  if (exists) {
    return res.status(400).json({ error: "Email já cadastrado." });
  }

  const { salt, hash } = createPasswordHash(password);
  const userId = randomUUID();
  const user = {
    id: userId,
    name: typeof name === "string" && name.trim() ? name.trim() : "Usuário",
    email: email.trim(),
    passwordHash: hash,
    passwordSalt: salt,
  };

  data.users.push(user);
  if (data.dataByUser?.legacy) {
    data.dataByUser[userId] = data.dataByUser.legacy;
    delete data.dataByUser.legacy;
  } else {
    data.dataByUser[userId] = {
      transactions: [],
      categories: DEFAULT_CATEGORIES,
    };
  }

  await saveData(data);
  return res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password || typeof email !== "string") {
    return res.status(400).json({ error: "Dados inválidos." });
  }

  const data = await loadData();
  const user = data.users.find(
    (item) => normalizeText(item.email) === normalizeText(email)
  );
  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: "Credenciais inválidas." });
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return res.status(400).json({ error: "Credenciais inválidas." });
  }

  const token = randomUUID();
  data.sessions = data.sessions ?? [];
  data.sessions.push({ token, userId: user.id, createdAt: Date.now() });
  await saveData(data);

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const data = await loadData();
  const user = data.users.find((item) => item.id === req.userId);
  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  return res.json({ id: user.id, name: user.name, email: user.email });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(400).json({ error: "Token inválido." });
  }
  const data = await loadData();
  data.sessions = (data.sessions ?? []).filter((item) => item.token !== token);
  await saveData(data);
  return res.json({ ok: true });
});

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth") || req.path === "/health") {
    return next();
  }
  return requireAuth(req, res, next);
});

app.get("/api/categories", async (req, res) => {
  const data = await loadData();
  const userData = getUserData(data, req.userId);
  res.json({ categories: ensureDefaultCategory(userData.categories ?? []) });
});

app.post("/api/categories", async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Categoria inválida." });
  }

  const data = await loadData();
  const userData = getUserData(data, req.userId);
  const categories = ensureDefaultCategory([
    ...(userData.categories ?? DEFAULT_CATEGORIES),
    name.trim(),
  ]);

  userData.categories = categories;
  await saveData(data);
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
  const userData = getUserData(data, req.userId);
  const filtered = ensureDefaultCategory(
    (userData.categories ?? DEFAULT_CATEGORIES).filter(
      (category) => normalizeText(category) !== normalizeText(name)
    )
  );

  userData.categories = filtered;
  await saveData(data);
  return res.json({ categories: filtered });
});

app.post("/api/categories/reset", async (req, res) => {
  const data = await loadData();
  const userData = getUserData(data, req.userId);
  userData.categories = DEFAULT_CATEGORIES;
  await saveData(data);
  return res.json({ categories: DEFAULT_CATEGORIES });
});

app.get("/api/transactions", async (req, res) => {
  const data = await loadData();
  const userData = getUserData(data, req.userId);
  const list = Array.isArray(userData.transactions)
    ? userData.transactions
    : [];
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
  res.json(sorted);
});

app.post("/api/transactions", async (req, res) => {
  const payload = req.body ?? {};
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const data = await loadData();
  const userData = getUserData(data, req.userId);
  const transactions = Array.isArray(userData.transactions)
    ? userData.transactions
    : [];
  const next = {
    ...payload,
    id: payload.id ?? randomUUID(),
  };

  transactions.unshift(next);
  userData.transactions = transactions;
  await saveData(data);
  return res.json(next);
});

app.put("/api/transactions/:id", async (req, res) => {
  const id = req.params.id;
  const payload = req.body ?? {};
  if (!id || !payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const data = await loadData();
  const userData = getUserData(data, req.userId);
  const transactions = Array.isArray(userData.transactions)
    ? userData.transactions
    : [];
  const index = transactions.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Transação não encontrada." });
  }

  const updated = { ...payload, id };
  transactions[index] = updated;
  userData.transactions = transactions;
  await saveData(data);
  return res.json(updated);
});

app.delete("/api/transactions/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "Id inválido." });
  }

  const data = await loadData();
  const userData = getUserData(data, req.userId);
  const transactions = Array.isArray(userData.transactions)
    ? userData.transactions
    : [];
  const next = transactions.filter((t) => t.id !== id);
  userData.transactions = next;
  await saveData(data);
  return res.json({ ok: true });
});

app.delete("/api/transactions", async (req, res) => {
  const data = await loadData();
  const userData = getUserData(data, req.userId);
  userData.transactions = [];
  await saveData(data);
  return res.json({ ok: true });
});

app.post("/api/transactions/import", async (req, res) => {
  const { transactions } = req.body ?? {};
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const data = await loadData();
  const userData = getUserData(data, req.userId);
  const current = Array.isArray(userData.transactions)
    ? userData.transactions
    : [];
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
  userData.transactions = next;
  await saveData(data);
  return res.json({ added: toAdd.length });
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
