import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
const fixtureIrregularLatin1Path = path.join(repoRoot, "tests", "fixtures", "import-irregular-latin1.csv");
const fixtureMixedInvalidPath = path.join(repoRoot, "tests", "fixtures", "import-mixed-invalid.csv");
const fixtureHistoricoDescricaoPath = path.join(repoRoot, "tests", "fixtures", "import-historico-descricao.csv");
const fixtureInterStatementPdfPath = path.join(repoRoot, "Arquivosdeexemplo", "Extrato-24-11-2025-a-21-02-2026-PDF.pdf");
const fixtureInterInvoicePdfPath = path.join(repoRoot, "Arquivosdeexemplo", "fatura-inter-2026-01.pdf");
const fixtureMercadoPagoPdfPath = path.join(repoRoot, "Arquivosdeexemplo", "Fatura_MP_20260210.pdf");
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
  const npmCommand = isWindows ? "cmd.exe" : "npm";
  const npmArgs = isWindows
    ? ["/d", "/s", "/c", `npm run dev:webpack -- --port ${port}`]
    : ["run", "dev:webpack", "--", "--port", String(port)];
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
    shell: false
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
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore" });
      await once(serverProcess, "exit").catch(() => undefined);
    } else {
      serverProcess.kill("SIGTERM");
      await once(serverProcess, "exit").catch(() => undefined);
    }
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

  const builtinSupermercadoCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Supermercado",
      color: "#16a34a"
    }
  });
  assert.equal(builtinSupermercadoCategory.status, 201);
  const builtinSupermercadoCategoryId = builtinSupermercadoCategory.payload?.id;
  assert.ok(typeof builtinSupermercadoCategoryId === "string");

  const builtinAlimentacaoCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Alimentacao",
      color: "#f97316"
    }
  });
  assert.equal(builtinAlimentacaoCategory.status, 201);
  const builtinAlimentacaoCategoryId = builtinAlimentacaoCategory.payload?.id;
  assert.ok(typeof builtinAlimentacaoCategoryId === "string");

  const builtinTransferenciasCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Transferencias",
      color: "#0ea5e9"
    }
  });
  assert.equal(builtinTransferenciasCategory.status, 201);
  const builtinTransferenciasCategoryId = builtinTransferenciasCategory.payload?.id;
  assert.ok(typeof builtinTransferenciasCategoryId === "string");

  const builtinTaxasCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Taxas e Encargos",
      color: "#475569"
    }
  });
  assert.equal(builtinTaxasCategory.status, 201);
  const builtinTaxasCategoryId = builtinTaxasCategory.payload?.id;
  assert.ok(typeof builtinTaxasCategoryId === "string");

  const userPriorityCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Padaria Manual",
      color: "#b91c1c"
    }
  });
  assert.equal(userPriorityCategory.status, 201);
  const userPriorityCategoryId = userPriorityCategory.payload?.id;
  assert.ok(typeof userPriorityCategoryId === "string");

  const reusedRuleCategory = await apiRequest("/api/categories", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Categoria Reaproveitada",
      color: "#4f46e5"
    }
  });
  assert.equal(reusedRuleCategory.status, 201);
  const reusedRuleCategoryId = reusedRuleCategory.payload?.id;
  assert.ok(typeof reusedRuleCategoryId === "string");

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

  const secondUserCookies = new Map();
  const secondUserEmail = `integration.second.${uniqueToken}@example.com`;
  const secondRegister = await apiRequest("/api/auth/register", {
    method: "POST",
    json: {
      name: "Second Integration User",
      email: secondUserEmail,
      password: userPassword,
      confirmPassword: userPassword
    }
  });
  assert.equal(secondRegister.status, 201);

  const secondCsrf = await apiRequest("/api/auth/csrf", { cookies: secondUserCookies });
  assert.equal(secondCsrf.status, 200);

  const secondLoginForm = new URLSearchParams({
    csrfToken: secondCsrf.payload.csrfToken,
    email: secondUserEmail,
    password: userPassword,
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true"
  });

  const secondLogin = await apiRequest("/api/auth/callback/credentials?json=true", {
    method: "POST",
    cookies: secondUserCookies,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: secondLoginForm.toString()
  });
  assert.ok([200, 302].includes(secondLogin.status));

  const crossUserMutation = await apiRequest(`/api/transactions/${transactionId}`, {
    method: "PATCH",
    cookies: secondUserCookies,
    json: {
      description: "Tentativa de acesso cruzado"
    }
  });
  assert.equal(crossUserMutation.status, 404);

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
  assert.ok(typeof parsedImport.payload?.totalRows === "number" && parsedImport.payload.totalRows >= 8);
  assert.ok(typeof parsedImport.payload?.validRows === "number" && parsedImport.payload.validRows >= 8);
  assert.ok(typeof parsedImport.payload?.ignoredRows === "number");
  assert.ok(typeof parsedImport.payload?.errorRows === "number");
  assert.ok(Array.isArray(parsedImport.payload?.preview) && parsedImport.payload.preview.length > 0);
  assert.ok(parsedImport.payload?.preview.some((row) => row.status === "ok"));

  const latin1Buffer = await fs.readFile(fixtureIrregularLatin1Path);
  const latin1FormData = new FormData();
  latin1FormData.set("file", new Blob([latin1Buffer], { type: "text/csv" }), "import-irregular-latin1.csv");

  const parsedLatin1 = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: latin1FormData
  });
  assert.equal(parsedLatin1.status, 200);
  assert.ok(["latin1", "cp1252"].includes(parsedLatin1.payload?.detectedEncoding));
  assert.ok(parsedLatin1.payload?.validRows >= 2);
  assert.ok(Array.isArray(parsedLatin1.payload?.preview));

  const mixedBuffer = await fs.readFile(fixtureMixedInvalidPath);
  const mixedFormData = new FormData();
  mixedFormData.set("file", new Blob([mixedBuffer], { type: "text/csv" }), "import-mixed-invalid.csv");

  const parsedMixed = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: mixedFormData
  });
  assert.equal(parsedMixed.status, 200);
  assert.equal(parsedMixed.payload?.sourceType, "csv");
  assert.ok(parsedMixed.payload?.ignoredRows >= 1);
  assert.ok(parsedMixed.payload?.errorRows >= 1);
  assert.ok(parsedMixed.payload?.reasons?.missing_date >= 1);
  assert.ok(parsedMixed.payload?.reasons?.missing_amount >= 1);
  assert.ok(parsedMixed.payload?.reasons?.invalid_amount >= 1);

  const invalidMappingFormData = new FormData();
  invalidMappingFormData.set("file", new Blob([mixedBuffer], { type: "text/csv" }), "import-mixed-invalid.csv");
  invalidMappingFormData.set(
    "mapping",
    JSON.stringify({
      date: "coluna_inexistente",
      description: "descricao",
      amount: "valor"
    })
  );

  const invalidMapping = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: invalidMappingFormData
  });
  assert.equal(invalidMapping.status, 400);
  assert.equal(invalidMapping.payload?.code, "invalid_mapping_columns");

  const emptyFileFormData = new FormData();
  emptyFileFormData.set("file", new Blob([], { type: "text/csv" }), "empty.csv");

  const emptyFileParse = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: emptyFileFormData
  });
  assert.equal(emptyFileParse.status, 400);
  assert.equal(emptyFileParse.payload?.code, "file_empty");

  const invalidPdfFormData = new FormData();
  invalidPdfFormData.set("file", new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n")], { type: "application/pdf" }), "invalid.pdf");

  const invalidPdfParse = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: invalidPdfFormData
  });
  assert.equal(invalidPdfParse.status, 422);
  assert.equal(invalidPdfParse.payload?.supported, false);
  assert.equal(invalidPdfParse.payload?.phase, "parse");

  const invalidOfxFormData = new FormData();
  invalidOfxFormData.set("file", new Blob([Buffer.from("<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>")], { type: "application/ofx" }), "invalid.ofx");

  const invalidOfxParse = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: invalidOfxFormData
  });
  assert.equal(invalidOfxParse.status, 422);
  assert.equal(invalidOfxParse.payload?.supported, false);
  assert.equal(invalidOfxParse.payload?.phase, "parse");

  const historicoDescricaoBuffer = await fs.readFile(fixtureHistoricoDescricaoPath);
  const historicoDescricaoFormData = new FormData();
  historicoDescricaoFormData.set("file", new Blob([historicoDescricaoBuffer], { type: "text/csv" }), "import-historico-descricao.csv");

  const parsedHistoricoDescricao = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: historicoDescricaoFormData
  });
  assert.equal(parsedHistoricoDescricao.status, 200);
  assert.equal(parsedHistoricoDescricao.payload?.sourceType, "csv");
  assert.ok(parsedHistoricoDescricao.payload?.validRows >= 5);
  assert.ok(Array.isArray(parsedHistoricoDescricao.payload?.rows) && parsedHistoricoDescricao.payload.rows.length >= 5);

  const firstHistoricoRow = parsedHistoricoDescricao.payload.rows[0];
  assert.equal(firstHistoricoRow.transactionKindRaw, "Pix enviado");
  assert.ok(firstHistoricoRow.counterpartyRaw.toUpperCase().includes("HELENA MARIA"));
  assert.equal(firstHistoricoRow.transactionKindNorm, "PIX ENVIADO");
  assert.ok(!firstHistoricoRow.counterpartyNorm.includes("ITU"));
  assert.ok(firstHistoricoRow.merchantKey.includes("helena"));

  const userPriorityRule = await apiRequest("/api/categories/rules", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Prioridade padaria teste",
      priority: 5,
      enabled: true,
      matchType: "contains",
      pattern: "PADARIA SAO FRANCISCO",
      categoryId: userPriorityCategoryId
    }
  });
  assert.equal(userPriorityRule.status, 201);

  const historicoCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "import-historico-descricao.csv",
      defaultAccountId: checkingAccountId,
      applyRules: true,
      applyLocalAi: false,
      rows: parsedHistoricoDescricao.payload.rows
    }
  });
  assert.equal(historicoCommit.status, 201);
  assert.ok(historicoCommit.payload?.deterministicCategorizedCount >= 3);

  const allAfterHistoricoImport = await apiRequest("/api/transactions?period=all&page=1&pageSize=200", {
    cookies: authCookies
  });
  assert.equal(allAfterHistoricoImport.status, 200);

  const padariaTx = allAfterHistoricoImport.payload.items.find((item) => item.description.includes("Padaria"));
  assert.ok(padariaTx);
  assert.equal(padariaTx.category?.id, userPriorityCategoryId);
  assert.ok(padariaTx.raw?.merchantKey?.includes("padaria"));
  assert.equal(padariaTx.raw?.transactionKindNorm, "PAGAMENTO EFETUADO");

  const mercadoTx = allAfterHistoricoImport.payload.items.find((item) => item.description.includes("Supermercados Pague"));
  assert.ok(mercadoTx);
  assert.ok([builtinSupermercadoCategoryId, marketCategoryId].includes(mercadoTx.category?.id));

  const tarifaTx = allAfterHistoricoImport.payload.items.find((item) => item.description.includes("Tarifa de manutencao"));
  assert.ok(tarifaTx);
  assert.equal(tarifaTx.category?.id, builtinTaxasCategoryId);

  const pixPessoaTx = allAfterHistoricoImport.payload.items.find((item) => item.description.includes("Helena Maria"));
  assert.ok(pixPessoaTx);
  assert.equal(pixPessoaTx.category?.id, builtinTransferenciasCategoryId);

  const saveRuleSeedCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "seed-save-rule.csv",
      defaultAccountId: checkingAccountId,
      applyRules: true,
      rows: [
        {
          date: "2026-02-26",
          description: "Loja de Bairro Exemplo",
          amount: -23.5,
          transactionKindRaw: "Compra no debito",
          counterpartyRaw: "Loja de Bairro Exemplo",
          merchantKey: "loja bairro exemplo",
          categoryId: reusedRuleCategoryId
        }
      ]
    }
  });
  assert.equal(saveRuleSeedCommit.status, 201);

  const reusableRuleCreation = await apiRequest("/api/categories/rules", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Regra reaproveitada loja bairro",
      priority: 20,
      enabled: true,
      matchType: "contains",
      pattern: "BAIRRO EXEMPLO",
      categoryId: reusedRuleCategoryId
    }
  });
  assert.equal(reusableRuleCreation.status, 201);

  const saveRuleReuseCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "reuse-save-rule.csv",
      defaultAccountId: checkingAccountId,
      applyRules: true,
      rows: [
        {
          date: "2026-02-27",
          description: "Loja de Bairro Exemplo",
          amount: -18.9,
          transactionKindRaw: "Compra no debito",
          counterpartyRaw: "Loja de Bairro Exemplo"
        }
      ]
    }
  });
  assert.equal(saveRuleReuseCommit.status, 201);
  assert.ok(saveRuleReuseCommit.payload?.deterministicCategorizedCount >= 1);

  const transactionsAfterReuse = await apiRequest("/api/transactions?period=all&page=1&pageSize=200", {
    cookies: authCookies
  });
  assert.equal(transactionsAfterReuse.status, 200);
  const reusedRuleTx = transactionsAfterReuse.payload.items.find(
    (item) => item.description === "Loja de Bairro Exemplo" && Number(item.amount) === -18.9
  );
  assert.ok(reusedRuleTx);
  assert.equal(reusedRuleTx.category?.id, reusedRuleCategoryId);

  const interStatementPdfBuffer = await fs.readFile(fixtureInterStatementPdfPath);
  const interStatementPdfFormData = new FormData();
  interStatementPdfFormData.set("file", new Blob([interStatementPdfBuffer], { type: "application/pdf" }), "Extrato-Inter.pdf");

  const parsedInterStatementPdf = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: interStatementPdfFormData
  });
  if (parsedInterStatementPdf.status === 200) {
    assert.equal(parsedInterStatementPdf.payload?.sourceType, "pdf");
    assert.equal(parsedInterStatementPdf.payload?.documentType, "bank_statement");
    assert.ok(parsedInterStatementPdf.payload?.rows?.length > 0);
    assert.ok(parsedInterStatementPdf.payload?.preview?.[0]?.transactionKind?.length > 0);
  } else {
    assert.equal(parsedInterStatementPdf.status, 422);
    assert.equal(parsedInterStatementPdf.payload?.supported, false);
    assert.equal(parsedInterStatementPdf.payload?.phase, "parse");
  }

  const interInvoicePdfBuffer = await fs.readFile(fixtureInterInvoicePdfPath);
  const interInvoicePdfFormData = new FormData();
  interInvoicePdfFormData.set("file", new Blob([interInvoicePdfBuffer], { type: "application/pdf" }), "fatura-inter.pdf");

  const parsedInterInvoicePdf = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: interInvoicePdfFormData
  });
  if (parsedInterInvoicePdf.status === 200) {
    assert.equal(parsedInterInvoicePdf.payload?.sourceType, "pdf");
    assert.equal(parsedInterInvoicePdf.payload?.documentType, "credit_card_invoice");
    assert.equal(parsedInterInvoicePdf.payload?.issuerProfile, "inter_invoice");
    assert.ok(parsedInterInvoicePdf.payload?.rows?.length > 0);
  } else {
    assert.equal(parsedInterInvoicePdf.status, 422);
    assert.equal(parsedInterInvoicePdf.payload?.supported, false);
    assert.equal(parsedInterInvoicePdf.payload?.phase, "parse");
  }

  const mercadoPagoPdfBuffer = await fs.readFile(fixtureMercadoPagoPdfPath);
  const mercadoPagoPdfFormData = new FormData();
  mercadoPagoPdfFormData.set("file", new Blob([mercadoPagoPdfBuffer], { type: "application/pdf" }), "fatura-mercado-pago.pdf");

  const parsedMercadoPagoPdf = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: mercadoPagoPdfFormData
  });

  if (parsedMercadoPagoPdf.status === 200) {
    assert.equal(parsedMercadoPagoPdf.payload?.sourceType, "pdf");
    assert.ok(parsedMercadoPagoPdf.payload?.rows?.length > 0);
  } else if (parsedMercadoPagoPdf.status === 422) {
    assert.equal(parsedMercadoPagoPdf.payload?.supported, false);
    assert.equal(parsedMercadoPagoPdf.payload?.phase, "parse");
  } else {
    assert.equal(parsedMercadoPagoPdf.status, 400);
    assert.equal(parsedMercadoPagoPdf.payload?.code, "pdf_password_required");

    const mercadoPagoPdfPassword = process.env.MP_PDF_PASSWORD;
    if (mercadoPagoPdfPassword) {
      const mercadoPagoPdfWithPasswordFormData = new FormData();
      mercadoPagoPdfWithPasswordFormData.set("file", new Blob([mercadoPagoPdfBuffer], { type: "application/pdf" }), "fatura-mercado-pago.pdf");
      mercadoPagoPdfWithPasswordFormData.set("pdfPassword", mercadoPagoPdfPassword);

      const parsedMercadoPagoPdfWithPassword = await apiRequest("/api/imports/parse", {
        method: "POST",
        cookies: authCookies,
        formData: mercadoPagoPdfWithPasswordFormData
      });

      assert.equal(parsedMercadoPagoPdfWithPassword.status, 200);
      assert.equal(parsedMercadoPagoPdfWithPassword.payload?.sourceType, "pdf");
      assert.ok(parsedMercadoPagoPdfWithPassword.payload?.rows?.length > 0);
    }
  }

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
  assert.ok(typeof firstImportCommit.payload?.duplicates === "number");
  assert.ok(typeof firstImportCommit.payload?.invalidRows === "number");

  const secondImportCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: importCommitPayload
  });
  assert.equal(secondImportCommit.status, 201);
  assert.equal(secondImportCommit.payload?.totalImported, 0);
  assert.ok(secondImportCommit.payload?.totalSkipped >= firstImportCommit.payload?.totalReceived);
  assert.ok(secondImportCommit.payload?.duplicates >= firstImportCommit.payload?.totalReceived);

  const samePayloadDuplicateRows = [
    {
      date: "2026-02-23",
      description: "Teste duplicado interno",
      amount: -12.34
    },
    {
      date: "2026-02-23",
      description: "Teste duplicado interno",
      amount: -12.34
    }
  ];

  const duplicateInsidePayload = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "duplicates-inside.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: samePayloadDuplicateRows
    }
  });
  assert.equal(duplicateInsidePayload.status, 201);
  assert.equal(duplicateInsidePayload.payload?.totalImported, 1);
  assert.equal(duplicateInsidePayload.payload?.duplicates, 1);
  assert.equal(duplicateInsidePayload.payload?.invalidRows, 0);

  const edgeCaseRows = [
    {
      date: "2026-02-24",
      description: "Café da Manhã",
      amount: -34.9
    },
    {
      date: "2026-02-25",
      description: "Cafe da manha",
      amount: -34.9
    }
  ];

  const edgeCaseCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "edge-case.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: edgeCaseRows
    }
  });
  assert.equal(edgeCaseCommit.status, 201);
  assert.equal(edgeCaseCommit.payload?.totalImported, 2);
  assert.equal(edgeCaseCommit.payload?.duplicates, 0);

  const invalidCommitPayload = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "invalid-payload.csv",
      rows: "nao-e-array"
    }
  });
  assert.equal(invalidCommitPayload.status, 400);
  assert.equal(invalidCommitPayload.payload?.code, "invalid_payload");

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
  assert.equal(oversizedImport.payload?.code, "rows_limit_exceeded");

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
