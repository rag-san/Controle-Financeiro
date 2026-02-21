import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const port = Number(process.env.TEST_PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePath = path.join(repoRoot, "tests", "fixtures", "import-transactions.csv");
const testDbRelativePath = path.join("data", "finance.integration.db");
const testDbPath = path.join(repoRoot, testDbRelativePath);
const serverBootTimeoutMs = 120_000;
const pollIntervalMs = 750;

let serverProcess = null;
const serverLogs = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieHeader(cookies) {
  if (!cookies || cookies.size === 0) {
    return "";
  }

  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function persistCookies(response, cookies) {
  if (!cookies || typeof response.headers.getSetCookie !== "function") {
    return;
  }

  for (const rawCookie of response.headers.getSetCookie()) {
    const [nameValue] = rawCookie.split(";");
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1).trim();

    if (!value) {
      cookies.delete(name);
      continue;
    }

    cookies.set(name, value);
  }
}

async function apiRequest(routePath, options = {}) {
  const {
    method = "GET",
    cookies,
    json,
    formData,
    body,
    headers = {}
  } = options;

  const requestHeaders = new Headers(headers);
  const serializedCookies = cookieHeader(cookies);
  if (serializedCookies) {
    requestHeaders.set("Cookie", serializedCookies);
  }

  let requestBody = body;
  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(json);
  } else if (formData) {
    requestBody = formData;
  }

  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
    redirect: "manual"
  });

  persistCookies(response, cookies);

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return {
    status: response.status,
    payload
  };
}

async function removeTestDbFiles() {
  const suffixes = ["", "-shm", "-wal"];

  for (const suffix of suffixes) {
    const filePath = `${testDbPath}${suffix}`;
    await fs.rm(filePath, { force: true }).catch(() => undefined);
  }
}

async function waitForServerReady() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < serverBootTimeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/session`, { redirect: "manual" });
      if (response.status === 200) {
        return;
      }
    } catch {
      // no-op while server is starting
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Servidor de teste nao inicializou em ${serverBootTimeoutMs}ms.\n${serverLogs.join("")}`);
}

before(async () => {
  await removeTestDbFiles();

  const isWindows = process.platform === "win32";
  const npmCommand = isWindows ? `npm run dev:webpack -- --port ${port}` : "npm";
  const npmArgs = isWindows ? [] : ["run", "dev:webpack", "--", "--port", String(port)];
  const env = {
    ...process.env,
    NEXTAUTH_URL: baseUrl,
    NEXTAUTH_SECRET: "integration-test-secret-change-me",
    FINANCE_DB_PATH: testDbRelativePath,
    API_PROFILING: "0"
  };

  serverProcess = spawn(npmCommand, npmArgs, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows
  });

  serverProcess.stdout.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
  });

  serverProcess.stderr.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
  });

  await waitForServerReady();
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    await once(serverProcess, "exit").catch(() => undefined);
  }

  await removeTestDbFiles();
});

test("critical backend flow via API", async () => {
  const authCookies = new Map();
  const uniqueToken = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const userEmail = `integration.${uniqueToken}@example.com`;
  const userPassword = "StrongPass!123";

  const unauthorizedTransactions = await apiRequest("/api/transactions");
  assert.equal(unauthorizedTransactions.status, 401);

  const register = await apiRequest("/api/auth/register", {
    method: "POST",
    json: {
      name: "Integration User",
      email: userEmail,
      password: userPassword,
      confirmPassword: userPassword
    }
  });
  assert.equal(register.status, 201);

  const csrf = await apiRequest("/api/auth/csrf", { cookies: authCookies });
  assert.equal(csrf.status, 200);
  assert.ok(typeof csrf.payload?.csrfToken === "string" && csrf.payload.csrfToken.length > 10);

  const loginForm = new URLSearchParams({
    csrfToken: csrf.payload.csrfToken,
    email: userEmail,
    password: userPassword,
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true"
  });

  const login = await apiRequest("/api/auth/callback/credentials?json=true", {
    method: "POST",
    cookies: authCookies,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: loginForm.toString()
  });
  assert.ok([200, 302].includes(login.status));

  const session = await apiRequest("/api/auth/session", { cookies: authCookies });
  assert.equal(session.status, 200);
  assert.equal(session.payload?.user?.email, userEmail);
  assert.ok(session.payload?.user?.id);

  const checkingAccount = await apiRequest("/api/accounts", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Conta Corrente",
      type: "checking",
      institution: "QA Bank",
      currency: "BRL"
    }
  });
  assert.equal(checkingAccount.status, 201);
  const checkingAccountId = checkingAccount.payload?.id;
  assert.ok(typeof checkingAccountId === "string");

  const creditAccount = await apiRequest("/api/accounts", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Cartao",
      type: "credit",
      institution: "QA Bank",
      currency: "BRL"
    }
  });
  assert.equal(creditAccount.status, 201);
  assert.ok(typeof creditAccount.payload?.id === "string");

  const marketCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Mercado QA",
      color: "#22c55e",
      icon: "ShoppingCart"
    }
  });
  assert.equal(marketCategory.status, 201);
  const marketCategoryId = marketCategory.payload?.id;
  assert.ok(typeof marketCategoryId === "string");

  const invalidTransactionPayload = await apiRequest("/api/transactions", {
    method: "POST",
    cookies: authCookies,
    json: {
      accountId: checkingAccountId,
      date: "2026-99-99",
      description: "Lancamento invalido",
      amount: -10
    }
  });
  assert.equal(invalidTransactionPayload.status, 400);

  const invalidNetWorthPayload = await apiRequest("/api/net-worth", {
    method: "POST",
    cookies: authCookies,
    json: {
      type: "asset",
      name: "Investimento teste",
      value: "abc",
      date: "2026-02-01"
    }
  });
  assert.equal(invalidNetWorthPayload.status, 400);

  const invalidRecurringPayload = await apiRequest("/api/recurring", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Mensalidade",
      amount: "abc",
      dueDay: 5
    }
  });
  assert.equal(invalidRecurringPayload.status, 400);

  const createdTransaction = await apiRequest("/api/transactions", {
    method: "POST",
    cookies: authCookies,
    json: {
      accountId: checkingAccountId,
      date: "2026-02-20",
      description: "Supermercado Local QA",
      amount: -150.34,
      status: "posted"
    }
  });
  assert.equal(createdTransaction.status, 201);
  const transactionId = createdTransaction.payload?.id;
  assert.ok(typeof transactionId === "string");

  const categorizedTransaction = await apiRequest(`/api/transactions/${transactionId}`, {
    method: "PATCH",
    cookies: authCookies,
    json: {
      categoryId: marketCategoryId
    }
  });
  assert.equal(categorizedTransaction.status, 200);
  assert.equal(categorizedTransaction.payload?.categoryId, marketCategoryId);

  const invalidTransactionDateUpdate = await apiRequest(`/api/transactions/${transactionId}`, {
    method: "PATCH",
    cookies: authCookies,
    json: {
      date: "not-a-date"
    }
  });
  assert.equal(invalidTransactionDateUpdate.status, 400);

  const pagedTransactions = await apiRequest("/api/transactions?period=all&page=1&pageSize=10", {
    cookies: authCookies
  });
  assert.equal(pagedTransactions.status, 200);
  assert.equal(pagedTransactions.payload?.pagination?.pageSize, 10);

  const filteredTransactions = await apiRequest("/api/transactions?period=all&page=1&pageSize=20&q=supermercado", {
    cookies: authCookies
  });
  assert.equal(filteredTransactions.status, 200);
  assert.ok(filteredTransactions.payload?.items?.some((item) => item.id === transactionId));

  const csvBuffer = await fs.readFile(fixturePath);
  const importFormData = new FormData();
  importFormData.set("file", new Blob([csvBuffer], { type: "text/csv" }), "import-transactions.csv");

  const parsedImport = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: importFormData
  });
  assert.equal(parsedImport.status, 200);
  assert.equal(parsedImport.payload?.sourceType, "csv");
  assert.ok(Array.isArray(parsedImport.payload?.rows) && parsedImport.payload.rows.length >= 8);

  const importCommitPayload = {
    sourceType: "csv",
    fileName: "import-transactions.csv",
    defaultAccountId: checkingAccountId,
    applyRules: false,
    applyLocalAi: false,
    rows: parsedImport.payload.rows
  };

  const firstImportCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: importCommitPayload
  });
  assert.equal(firstImportCommit.status, 201);
  assert.ok(firstImportCommit.payload?.totalImported > 0);

  const secondImportCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: importCommitPayload
  });
  assert.equal(secondImportCommit.status, 201);
  assert.equal(secondImportCommit.payload?.totalImported, 0);
  assert.ok(secondImportCommit.payload?.totalSkipped >= firstImportCommit.payload?.totalReceived);

  const oversizedImport = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "oversized.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: Array.from({ length: 5001 }, () => ({
        date: "2026-01-01",
        description: "x",
        amount: 1
      }))
    }
  });
  assert.equal(oversizedImport.status, 400);

  const importBatches = await apiRequest("/api/imports", { cookies: authCookies });
  assert.equal(importBatches.status, 200);
  assert.ok(Array.isArray(importBatches.payload) && importBatches.payload.length >= 1);

  const summaryFrom = new Date("2025-11-01T00:00:00.000Z");
  const summaryTo = new Date("2026-03-31T23:59:59.999Z");
  const summary = await apiRequest(
    `/api/dashboard/summary?from=${encodeURIComponent(summaryFrom.toISOString())}&to=${encodeURIComponent(summaryTo.toISOString())}`,
    {
      cookies: authCookies
    }
  );
  assert.equal(summary.status, 200);

  const allTransactions = await apiRequest("/api/transactions?period=all&page=1&pageSize=200", {
    cookies: authCookies
  });
  assert.equal(allTransactions.status, 200);

  let expectedIncomeCents = 0;
  let expectedExpenseCents = 0;

  for (const item of allTransactions.payload.items) {
    const postedAt = new Date(item.date).getTime();
    if (!Number.isFinite(postedAt)) {
      continue;
    }
    if (postedAt < summaryFrom.getTime() || postedAt > summaryTo.getTime()) {
      continue;
    }

    const absCents = Math.round(Math.abs(Number(item.amount)) * 100);
    if (Number(item.amount) >= 0) {
      expectedIncomeCents += absCents;
    } else {
      expectedExpenseCents += absCents;
    }
  }

  assert.equal(summary.payload?.totals?.income, expectedIncomeCents);
  assert.equal(summary.payload?.totals?.expenses, expectedExpenseCents);
  assert.equal(summary.payload?.totals?.net, expectedIncomeCents - expectedExpenseCents);
  assert.ok(Array.isArray(summary.payload?.byCategory) && summary.payload.byCategory.length > 0);

  const dashboard = await apiRequest("/api/dashboard", { cookies: authCookies });
  assert.equal(dashboard.status, 200);
  assert.ok(Array.isArray(dashboard.payload?.topCategories));
});
