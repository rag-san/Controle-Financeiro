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
const integrationDatabaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:55432/finance_test";
const serverBootTimeoutMs = 120_000;
const pollIntervalMs = 750;

let serverProcess = null;
const serverLogs = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(lines) {
  const fontSize = 11;
  const lineHeight = 14;
  let y = 800;
  const textOps = ["BT", `/F1 ${fontSize} Tf`];

  for (const line of lines) {
    textOps.push(`1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= lineHeight;
  }

  textOps.push("ET");
  const content = `${textOps.join("\n")}\n`;

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream`);

  let pdfText = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdfText, "utf8"));
    pdfText += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdfText, "utf8");
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= objects.length; objectId += 1) {
    pdfText += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdfText, "utf8");
}

function buildPdfFixtures() {
  const interStatement = buildSimplePdfBuffer([
    "BANCO INTER",
    "EXTRATO CONTA CORRENTE",
    "SALDO DO DIA",
    "PIX",
    "01 de fevereiro de 2026",
    "PIX ENVIADO HELENA -R$ 120,50",
    "PIX RECEBIDO JOAO R$ 300,00",
    "02 de fevereiro de 2026",
    "COMPRA MERCADO -R$ 89,90"
  ]);

  const interInvoice = buildSimplePdfBuffer([
    "BANCO INTER",
    "DESPESAS DA FATURA",
    "FATURA",
    "Vencimento: 10/02/2026",
    "05 de janeiro 2026 MERCADO QA R$ 89,90",
    "07 de janeiro 2026 PAGAMENTO RECEBIDO + R$ 89,90"
  ]);

  const mercadoPagoInvoice = buildSimplePdfBuffer([
    "MERCADO PAGO",
    "DETALHES DE CONSUMO",
    "FATURA",
    "Vencimento: 10/02/2026",
    "05/02 COMPRA APP R$ 45,90",
    "08/02 ESTORNO APP R$ 10,00"
  ]);

  const mercadoPagoStatement = buildSimplePdfBuffer([
    "MERCADO PAGO",
    "EXTRATO DE CONTA",
    "DETALHE DOS MOVIMENTOS",
    "Data Descrição ID da operação Valor Saldo",
    "07-01-2026 Transferência Pix recebida FULANO 141018819732 R$ 1.894,00 R$ 1.903,13",
    "08-01-2026 Pagamento Cartão de crédito 141130666804 R$ -321,74 R$ 1.081,39"
  ]);

  const nubankInvoice = buildSimplePdfBuffer([
    "NUBANK",
    "FATURA",
    "Data de vencimento: 16 FEV 2026",
    "TRANSAÇÕES DE 16 JAN A 16 FEV",
    "16 JAN Pagamento em 16 JAN -R$ 1.459,22",
    "16 JAN Parcelamento de Compra \"Loja QA\" - Parcela 2/6",
    "R$ 218,03"
  ]);

  return {
    interStatement,
    interInvoice,
    mercadoPagoInvoice,
    mercadoPagoStatement,
    nubankInvoice
  };
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
    payload,
    headers: response.headers
  };
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
  const isWindows = process.platform === "win32";
  const npmCommand = isWindows ? "cmd.exe" : "npm";
  const npmArgs = isWindows
    ? ["/d", "/s", "/c", `npm run dev:webpack -- --port ${port}`]
    : ["run", "dev:webpack", "--", "--port", String(port)];
  const env = {
    ...process.env,
    NEXTAUTH_URL: baseUrl,
    NEXTAUTH_SECRET: "integration-test-secret-change-me",
    DATABASE_URL: integrationDatabaseUrl,
    POSTGRES_URL: process.env.POSTGRES_URL ?? integrationDatabaseUrl,
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

  const reserveCheckingAccount = await apiRequest("/api/accounts", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Conta Reserva QA",
      type: "checking",
      institution: "QA Bank",
      currency: "BRL"
    }
  });
  assert.equal(reserveCheckingAccount.status, 201);
  const reserveCheckingAccountId = reserveCheckingAccount.payload?.id;
  assert.ok(typeof reserveCheckingAccountId === "string");

  const creditAccount = await apiRequest("/api/accounts", {
    method: "POST",
    cookies: authCookies,
    json: {
      name: "Cartao Inter",
      type: "credit",
      institution: "QA Bank",
      currency: "BRL",
      parentAccountId: checkingAccountId
    }
  });
  assert.equal(creditAccount.status, 201);
  const creditAccountId = creditAccount.payload?.id;
  assert.ok(typeof creditAccountId === "string");

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

  const balancesBeforeTransferFlow = await apiRequest("/api/accounts", { cookies: authCookies });
  assert.equal(balancesBeforeTransferFlow.status, 200);
  const checkingBalanceBeforeTransfer =
    balancesBeforeTransferFlow.payload.find((item) => item.id === checkingAccountId)?.currentBalance ?? 0;
  const creditBalanceBeforeTransfer =
    balancesBeforeTransferFlow.payload.find((item) => item.id === creditAccountId)?.currentBalance ?? 0;

  const statementWithCardPaymentCommitPayload = {
    sourceType: "csv",
    fileName: "statement-card-payment.csv",
    defaultAccountId: checkingAccountId,
    mapping: {
      convertCardPaymentsToTransfer: true,
      cardPaymentTargetAccountId: creditAccountId
    },
    applyRules: false,
    rows: [
      {
        date: "2026-02-20",
        description: "Compra mercado QA statement",
        amount: -120
      },
      {
        date: "2026-02-21",
        description: "Credit Card Payment Inter",
        amount: -500
      }
    ]
  };

  const statementWithCardPaymentCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: statementWithCardPaymentCommitPayload
  });
  assert.equal(statementWithCardPaymentCommit.status, 201);
  assert.equal(statementWithCardPaymentCommit.payload?.totalTransfersCreated, 1);
  assert.equal(statementWithCardPaymentCommit.payload?.totalCardPaymentsDetected, 1);
  assert.equal(statementWithCardPaymentCommit.payload?.totalCardPaymentsNotConverted, 0);

  const transactionsAfterStatementTransfer = await apiRequest("/api/transactions?period=all&page=1&pageSize=200", {
    cookies: authCookies
  });
  assert.equal(transactionsAfterStatementTransfer.status, 200);

  const cardPaymentTransferLegs = transactionsAfterStatementTransfer.payload.items.filter(
    (item) =>
      item.type === "transfer" &&
      item.description.includes("Credit Card Payment Inter")
  );
  assert.equal(cardPaymentTransferLegs.length, 2);
  assert.ok(cardPaymentTransferLegs.some((item) => item.accountId === checkingAccountId && Number(item.amount) < 0));
  assert.ok(cardPaymentTransferLegs.some((item) => item.accountId === creditAccountId && Number(item.amount) > 0));

  const invoiceCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "pdf",
      fileName: "invoice-credit-card.pdf",
      defaultAccountId: creditAccountId,
      mapping: {
        skipCardPaymentLines: true
      },
      applyRules: false,
      rows: [
        {
          date: "2026-02-22",
          description: "Compra no credito teste",
          amount: -250,
          documentType: "credit_card_invoice"
        },
        {
          date: "2026-02-22",
          description: "Pagamento Recebido Fatura",
          amount: 250,
          documentType: "credit_card_invoice"
        },
        {
          date: "2026-02-22",
          description: "PAGAMENTO ON LINE",
          amount: 862.08,
          documentType: "credit_card_invoice"
        }
      ]
    }
  });
  assert.equal(invoiceCommit.status, 201);
  assert.equal(invoiceCommit.payload?.totalImported, 1);
  assert.ok(invoiceCommit.payload?.totalSkipped >= 2);

  const invoiceWrongDefaultCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "pdf",
      fileName: "invoice-credit-card-wrong-default.pdf",
      defaultAccountId: checkingAccountId,
      mapping: {
        skipCardPaymentLines: true
      },
      applyRules: false,
      rows: [
        {
          date: "2026-02-23",
          description: "Compra no credito roteada para cartao",
          amount: -130,
          documentType: "credit_card_invoice"
        }
      ]
    }
  });
  assert.equal(invoiceWrongDefaultCommit.status, 201);
  assert.equal(invoiceWrongDefaultCommit.payload?.totalImported, 1);

  const statementReimport = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: statementWithCardPaymentCommitPayload
  });
  assert.equal(statementReimport.status, 201);
  assert.equal(statementReimport.payload?.totalTransfersCreated, 0);
  assert.ok(statementReimport.payload?.duplicates >= 2);

  const transactionsAfterStatementReimport = await apiRequest("/api/transactions?period=all&page=1&pageSize=200", {
    cookies: authCookies
  });
  assert.equal(transactionsAfterStatementReimport.status, 200);
  const transferLegsAfterReimport = transactionsAfterStatementReimport.payload.items.filter(
    (item) =>
      item.type === "transfer" &&
      item.description.includes("Credit Card Payment Inter")
  );
  assert.equal(transferLegsAfterReimport.length, 2);

  const routedCreditPurchase = transactionsAfterStatementReimport.payload.items.find(
    (item) => item.description === "Compra no credito roteada para cartao"
  );
  assert.ok(routedCreditPurchase);
  assert.equal(routedCreditPurchase.accountId, creditAccountId);
  const onlinePaymentLine = transactionsAfterStatementReimport.payload.items.find(
    (item) => item.description === "PAGAMENTO ON LINE"
  );
  assert.equal(onlinePaymentLine, undefined);

  const balancesAfterTransferFlow = await apiRequest("/api/accounts", { cookies: authCookies });
  assert.equal(balancesAfterTransferFlow.status, 200);
  const checkingBalanceAfterTransfer =
    balancesAfterTransferFlow.payload.find((item) => item.id === checkingAccountId)?.currentBalance ?? 0;
  const creditBalanceAfterTransfer =
    balancesAfterTransferFlow.payload.find((item) => item.id === creditAccountId)?.currentBalance ?? 0;

  assert.equal(Number((checkingBalanceAfterTransfer - checkingBalanceBeforeTransfer).toFixed(2)), -620);
  assert.equal(Number((creditBalanceAfterTransfer - creditBalanceBeforeTransfer).toFixed(2)), 120);

  const februarySummary = await apiRequest(
    `/api/dashboard/summary?from=${encodeURIComponent("2026-02-01T00:00:00.000Z")}&to=${encodeURIComponent("2026-02-28T23:59:59.999Z")}`,
    {
      cookies: authCookies
    }
  );
  assert.equal(februarySummary.status, 200);

  const februaryTransactions = transactionsAfterStatementReimport.payload.items.filter((item) => {
    const postedAt = new Date(item.date).getTime();
    return postedAt >= new Date("2026-02-01T00:00:00.000Z").getTime() &&
      postedAt <= new Date("2026-02-28T23:59:59.999Z").getTime();
  });
  const expectedFebruaryExpensesCents = februaryTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + Math.round(Math.abs(Number(item.amount)) * 100), 0);
  assert.equal(februarySummary.payload?.totals?.expenses, expectedFebruaryExpensesCents);

  const noDuplicateInvoiceExpenseCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "pdf",
      fileName: "invoice-no-duplicate-expense.pdf",
      defaultAccountId: creditAccountId,
      mapping: {
        skipCardPaymentLines: true
      },
      applyRules: false,
      rows: [
        {
          date: "2026-03-01",
          description: "Compra cartao sem duplicidade",
          amount: -1000,
          documentType: "credit_card_invoice"
        }
      ]
    }
  });
  assert.equal(noDuplicateInvoiceExpenseCommit.status, 201);
  assert.equal(noDuplicateInvoiceExpenseCommit.payload?.totalImported, 1);

  const checkingCardPaymentTransferCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "checking-card-payment-transfer.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: [
        {
          date: "2026-03-02",
          description: "PAGAMENTO FATURA CARTAO QA",
          amount: -1000
        }
      ]
    }
  });
  assert.equal(checkingCardPaymentTransferCommit.status, 201);
  assert.ok(checkingCardPaymentTransferCommit.payload?.totalImported >= 1);

  const marchTransactionsSnapshot = await apiRequest(
    "/api/transactions?period=custom&from=2026-03-01&to=2026-03-31&page=1&pageSize=200",
    {
      cookies: authCookies
    }
  );
  assert.equal(marchTransactionsSnapshot.status, 200);

  const cardPaymentRowsMarch = marchTransactionsSnapshot.payload.items.filter(
    (item) => item.description.includes("PAGAMENTO FATURA CARTAO QA")
  );
  assert.ok(cardPaymentRowsMarch.length >= 1);
  assert.ok(cardPaymentRowsMarch.every((item) => item.type === "transfer"));

  const marchExpenseCents = marchTransactionsSnapshot.payload.items
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + Math.round(Math.abs(Number(item.amount)) * 100), 0);
  assert.equal(marchExpenseCents, 100000);

  const internalTransferMatchCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "internal-transfer-match.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: [
        {
          date: "2026-03-05",
          accountId: checkingAccountId,
          description: "PIX TRANSFERENCIA CONTA RESERVA",
          amount: -500
        },
        {
          date: "2026-03-06",
          accountId: reserveCheckingAccountId,
          description: "PIX TRANSFERENCIA RECEBIDA CONTA RESERVA",
          amount: 500
        }
      ]
    }
  });
  assert.equal(internalTransferMatchCommit.status, 201);
  assert.equal(internalTransferMatchCommit.payload?.totalTransfersCreated, 1);

  const transferMatchTransactions = await apiRequest(
    "/api/transactions?period=custom&from=2026-03-05&to=2026-03-06&page=1&pageSize=200",
    {
      cookies: authCookies
    }
  );
  assert.equal(transferMatchTransactions.status, 200);

  const matchedTransferLegs = transferMatchTransactions.payload.items.filter(
    (item) =>
      item.type === "transfer" &&
      [checkingAccountId, reserveCheckingAccountId].includes(item.accountId) &&
      Math.round(Math.abs(Number(item.amount)) * 100) === 50000
  );
  assert.equal(matchedTransferLegs.length, 2);
  const matchedTransferGroupId = matchedTransferLegs[0]?.transferGroupId ?? null;
  assert.ok(typeof matchedTransferGroupId === "string" && matchedTransferGroupId.length > 0);
  assert.ok(matchedTransferLegs.every((item) => item.transferGroupId === matchedTransferGroupId));

  const transferOnlySummary = await apiRequest(
    `/api/dashboard/summary?from=${encodeURIComponent("2026-03-05T00:00:00.000Z")}&to=${encodeURIComponent("2026-03-06T23:59:59.999Z")}`,
    {
      cookies: authCookies
    }
  );
  assert.equal(transferOnlySummary.status, 200);
  assert.equal(transferOnlySummary.payload?.totals?.income, 0);
  assert.equal(transferOnlySummary.payload?.totals?.expenses, 0);

  const lowConfidenceTransferReviewCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "internal-transfer-low-confidence-review.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: [
        {
          date: "2026-03-08",
          accountId: checkingAccountId,
          description: "PIX TRANSFERENCIA PROJETO ALFA BETA",
          amount: -450
        },
        {
          date: "2026-03-09",
          accountId: reserveCheckingAccountId,
          description: "PIX RECEBIDO ALFA BETA RESERVA GAMMA",
          amount: 450
        }
      ]
    }
  });
  assert.equal(lowConfidenceTransferReviewCommit.status, 201);
  assert.equal(lowConfidenceTransferReviewCommit.payload?.totalTransfersCreated, 0);
  assert.ok(lowConfidenceTransferReviewCommit.payload?.transferReviewSuggestionsCount >= 1);
  assert.ok(Array.isArray(lowConfidenceTransferReviewCommit.payload?.transferReviewSuggestions));

  const lowConfidenceTransferRows = await apiRequest(
    "/api/transactions?period=custom&from=2026-03-08&to=2026-03-09&page=1&pageSize=200",
    {
      cookies: authCookies
    }
  );
  assert.equal(lowConfidenceTransferRows.status, 200);
  const lowConfidenceRows = lowConfidenceTransferRows.payload.items.filter(
    (item) =>
      item.description.includes("PROJETO ALFA BETA") || item.description.includes("ALFA BETA RESERVA GAMMA")
  );
  assert.equal(lowConfidenceRows.length, 2);
  assert.ok(lowConfidenceRows.every((item) => item.type !== "transfer"));

  const pixToThirdPartyCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: authCookies,
    json: {
      sourceType: "csv",
      fileName: "pix-third-party-counterexample.csv",
      defaultAccountId: checkingAccountId,
      applyRules: false,
      rows: [
        {
          date: "2026-03-07",
          accountId: checkingAccountId,
          description: "PIX ENVIADO FORNECEDOR EXTERNO",
          amount: -300
        }
      ]
    }
  });
  assert.equal(pixToThirdPartyCommit.status, 201);
  assert.equal(pixToThirdPartyCommit.payload?.totalTransfersCreated, 0);

  const thirdPartyPixTransactions = await apiRequest(
    "/api/transactions?period=custom&from=2026-03-07&to=2026-03-07&page=1&pageSize=100",
    {
      cookies: authCookies
    }
  );
  assert.equal(thirdPartyPixTransactions.status, 200);
  const thirdPartyPix = thirdPartyPixTransactions.payload.items.find(
    (item) => item.description === "PIX ENVIADO FORNECEDOR EXTERNO"
  );
  assert.ok(thirdPartyPix);
  assert.equal(thirdPartyPix.type, "expense");

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

  const secondCheckingAccount = await apiRequest("/api/accounts", {
    method: "POST",
    cookies: secondUserCookies,
    json: {
      name: "Inter",
      type: "checking",
      institution: "Inter",
      currency: "BRL"
    }
  });
  assert.equal(secondCheckingAccount.status, 201);
  const secondCheckingAccountId = secondCheckingAccount.payload?.id;
  assert.ok(typeof secondCheckingAccountId === "string");

  const secondUserInvoiceCommit = await apiRequest("/api/imports/commit", {
    method: "POST",
    cookies: secondUserCookies,
    json: {
      sourceType: "pdf",
      fileName: "fatura-inter-segundo-usuario.pdf",
      defaultAccountId: secondCheckingAccountId,
      mapping: {
        skipCardPaymentLines: true
      },
      applyRules: false,
      rows: [
        {
          date: "2026-02-24",
          description: "Compra no credito auto criada",
          amount: -89.9,
          documentType: "credit_card_invoice"
        }
      ]
    }
  });
  assert.equal(secondUserInvoiceCommit.status, 201);
  assert.equal(secondUserInvoiceCommit.payload?.totalImported, 1);

  const secondUserAccountsAfterInvoice = await apiRequest("/api/accounts", {
    cookies: secondUserCookies
  });
  assert.equal(secondUserAccountsAfterInvoice.status, 200);
  const secondUserAutoCreatedCredit = secondUserAccountsAfterInvoice.payload.find(
    (item) => item.type === "credit" && item.parentAccountId === secondCheckingAccountId
  );
  assert.ok(secondUserAutoCreatedCredit);

  const secondUserTransactionsAfterInvoice = await apiRequest("/api/transactions?period=all&page=1&pageSize=100", {
    cookies: secondUserCookies
  });
  assert.equal(secondUserTransactionsAfterInvoice.status, 200);
  const secondUserInvoiceTx = secondUserTransactionsAfterInvoice.payload.items.find(
    (item) => item.description === "Compra no credito auto criada"
  );
  assert.ok(secondUserInvoiceTx);
  assert.equal(secondUserInvoiceTx.accountId, secondUserAutoCreatedCredit.id);

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
  assert.ok(["source_parser_unavailable", "pdf_no_transactions"].includes(invalidPdfParse.payload?.code));

  const invalidOfxFormData = new FormData();
  invalidOfxFormData.set("file", new Blob([Buffer.from("<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>")], { type: "application/ofx" }), "invalid.ofx");

  const invalidOfxParse = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: invalidOfxFormData
  });
  assert.equal(invalidOfxParse.status, 422);
  assert.equal(invalidOfxParse.payload?.code, "source_parser_unavailable");
  assert.equal(invalidOfxParse.payload?.details?.sourceType, "ofx");

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

  const generatedPdfFixtures = buildPdfFixtures();
  const generatedInterStatementFormData = new FormData();
  generatedInterStatementFormData.set(
    "file",
    new Blob([generatedPdfFixtures.interStatement], { type: "application/pdf" }),
    "fixture-inter-statement.pdf"
  );

  const parsedGeneratedInterStatement = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: generatedInterStatementFormData
  });
  assert.equal(parsedGeneratedInterStatement.status, 200);
  assert.equal(parsedGeneratedInterStatement.payload?.sourceType, "pdf");
  assert.equal(parsedGeneratedInterStatement.payload?.documentType, "bank_statement");
  assert.equal(parsedGeneratedInterStatement.payload?.issuerProfile, "inter_statement");
  assert.ok(Array.isArray(parsedGeneratedInterStatement.payload?.rows));
  assert.ok(parsedGeneratedInterStatement.payload?.rows?.length >= 2);

  const generatedInterInvoiceFormData = new FormData();
  generatedInterInvoiceFormData.set(
    "file",
    new Blob([generatedPdfFixtures.interInvoice], { type: "application/pdf" }),
    "fixture-inter-invoice.pdf"
  );

  const parsedGeneratedInterInvoice = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: generatedInterInvoiceFormData
  });
  assert.equal(parsedGeneratedInterInvoice.status, 200);
  assert.equal(parsedGeneratedInterInvoice.payload?.sourceType, "pdf");
  assert.equal(parsedGeneratedInterInvoice.payload?.documentType, "credit_card_invoice");
  assert.equal(parsedGeneratedInterInvoice.payload?.issuerProfile, "inter_invoice");
  assert.ok(Array.isArray(parsedGeneratedInterInvoice.payload?.rows));
  assert.ok(parsedGeneratedInterInvoice.payload?.rows?.length >= 1);

  const generatedMercadoPagoInvoiceFormData = new FormData();
  generatedMercadoPagoInvoiceFormData.set(
    "file",
    new Blob([generatedPdfFixtures.mercadoPagoInvoice], { type: "application/pdf" }),
    "fixture-mercado-pago-invoice.pdf"
  );

  const parsedGeneratedMercadoPagoInvoice = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: generatedMercadoPagoInvoiceFormData
  });
  assert.equal(parsedGeneratedMercadoPagoInvoice.status, 200);
  assert.equal(parsedGeneratedMercadoPagoInvoice.payload?.sourceType, "pdf");
  assert.equal(parsedGeneratedMercadoPagoInvoice.payload?.documentType, "credit_card_invoice");
  assert.equal(parsedGeneratedMercadoPagoInvoice.payload?.issuerProfile, "mercado_pago_invoice");
  assert.ok(Array.isArray(parsedGeneratedMercadoPagoInvoice.payload?.rows));
  assert.ok(parsedGeneratedMercadoPagoInvoice.payload?.rows?.length >= 1);

  const generatedMercadoPagoStatementFormData = new FormData();
  generatedMercadoPagoStatementFormData.set(
    "file",
    new Blob([generatedPdfFixtures.mercadoPagoStatement], { type: "application/pdf" }),
    "fixture-mercado-pago-statement.pdf"
  );

  const parsedGeneratedMercadoPagoStatement = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: generatedMercadoPagoStatementFormData
  });
  assert.equal(parsedGeneratedMercadoPagoStatement.status, 200);
  assert.equal(parsedGeneratedMercadoPagoStatement.payload?.sourceType, "pdf");
  assert.equal(parsedGeneratedMercadoPagoStatement.payload?.documentType, "bank_statement");
  assert.equal(parsedGeneratedMercadoPagoStatement.payload?.issuerProfile, "mercado_pago_statement");
  assert.ok(Array.isArray(parsedGeneratedMercadoPagoStatement.payload?.rows));
  assert.ok(parsedGeneratedMercadoPagoStatement.payload?.rows?.length >= 2);

  const generatedNubankInvoiceFormData = new FormData();
  generatedNubankInvoiceFormData.set(
    "file",
    new Blob([generatedPdfFixtures.nubankInvoice], { type: "application/pdf" }),
    "fixture-nubank-invoice.pdf"
  );

  const parsedGeneratedNubankInvoice = await apiRequest("/api/imports/parse", {
    method: "POST",
    cookies: authCookies,
    formData: generatedNubankInvoiceFormData
  });
  assert.equal(parsedGeneratedNubankInvoice.status, 200);
  assert.equal(parsedGeneratedNubankInvoice.payload?.sourceType, "pdf");
  assert.equal(parsedGeneratedNubankInvoice.payload?.documentType, "credit_card_invoice");
  assert.equal(parsedGeneratedNubankInvoice.payload?.issuerProfile, "nubank_invoice");
  assert.ok(Array.isArray(parsedGeneratedNubankInvoice.payload?.rows));
  assert.ok(parsedGeneratedNubankInvoice.payload?.rows?.length >= 2);

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
    if (item.type === "income") {
      expectedIncomeCents += absCents;
    } else if (item.type === "expense") {
      expectedExpenseCents += absCents;
    }
  }

  assert.equal(summary.payload?.totals?.income, expectedIncomeCents);
  assert.equal(summary.payload?.totals?.expenses, expectedExpenseCents);
  assert.equal(summary.payload?.totals?.net, expectedIncomeCents - expectedExpenseCents);
  assert.ok(Array.isArray(summary.payload?.byCategory) && summary.payload.byCategory.length > 0);

  const dashboard = await apiRequest("/api/dashboard", { cookies: authCookies });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get("Deprecation"), "true");
  assert.equal(dashboard.headers.get("X-API-Successor"), "/api/metrics/official?view=dashboard");
  assert.ok(Array.isArray(dashboard.payload?.topCategories));

  const legacyReports = await apiRequest("/api/reports", { cookies: authCookies });
  assert.equal(legacyReports.status, 200);
  assert.equal(legacyReports.headers.get("Deprecation"), "true");
  assert.equal(
    legacyReports.headers.get("X-API-Successor"),
    "/api/metrics/official?view=reports&preset=3M"
  );

  const officialDashboard = await apiRequest("/api/metrics/official?view=dashboard", {
    cookies: authCookies
  });
  assert.equal(officialDashboard.status, 200);
  assert.equal(officialDashboard.payload?.view, "dashboard");
  const expectedCurrentMonth = new Date().toISOString().slice(0, 7);
  assert.equal(officialDashboard.payload?.referenceMonth, expectedCurrentMonth);
  assert.equal(officialDashboard.payload?.isCurrentMonthReference, true);
  assert.equal(typeof officialDashboard.payload?.cards?.income, "number");
  assert.equal(typeof officialDashboard.payload?.cards?.expense, "number");
  assert.equal(typeof officialDashboard.payload?.cards?.result, "number");
  assert.ok(Array.isArray(officialDashboard.payload?.topCategories));

  const officialDashboardHistorical = await apiRequest("/api/metrics/official?view=dashboard&month=2026-01", {
    cookies: authCookies
  });
  assert.equal(officialDashboardHistorical.status, 200);
  assert.equal(officialDashboardHistorical.payload?.view, "dashboard");
  assert.equal(officialDashboardHistorical.payload?.referenceMonth, "2026-01");
  assert.equal(officialDashboardHistorical.payload?.isCurrentMonthReference, false);

  const officialReports = await apiRequest("/api/metrics/official?view=reports&preset=3M", {
    cookies: authCookies
  });
  assert.equal(officialReports.status, 200);
  assert.equal(officialReports.payload?.view, "reports");
  assert.ok(Array.isArray(officialReports.payload?.accounts));
  assert.ok(Array.isArray(officialReports.payload?.categories));
  assert.ok(Array.isArray(officialReports.payload?.model?.categorySpending));
  const officialCategorySum = (officialReports.payload?.model?.categorySpending ?? []).reduce(
    (sum, item) => sum + Number(item.value ?? 0),
    0
  );
  assert.ok(
    Math.abs(officialCategorySum - Number(officialReports.payload?.model?.currentTotals?.expense ?? 0)) <= 0.01
  );

  const officialCashflow = await apiRequest("/api/metrics/official?view=cashflow&period=3m", {
    cookies: authCookies
  });
  assert.equal(officialCashflow.status, 200);
  assert.equal(officialCashflow.payload?.view, "cashflow");
  assert.equal(typeof officialCashflow.payload?.data?.income?.current, "number");
  assert.equal(typeof officialCashflow.payload?.data?.expense?.current, "number");
  assert.equal(typeof officialCashflow.payload?.data?.netResult?.current, "number");

  const officialCategories = await apiRequest("/api/metrics/official?view=categories&month=2026-02", {
    cookies: authCookies
  });
  assert.equal(officialCategories.status, 200);
  assert.equal(officialCategories.payload?.view, "categories");
  assert.equal(officialCategories.payload?.month, "2026-02");
  assert.ok(Array.isArray(officialCategories.payload?.aggregates?.groups));
  assert.equal(typeof officialCategories.payload?.aggregates?.totalSpent, "number");

  const importObservability = await apiRequest("/api/metrics/import-observability", {
    cookies: authCookies
  });
  assert.equal(importObservability.status, 200);
  assert.equal(importObservability.payload?.view, "import-observability");
  assert.equal(typeof importObservability.payload?.thresholds?.minEvents, "number");
  assert.ok(Array.isArray(importObservability.payload?.alerts));
  assert.ok(Array.isArray(importObservability.payload?.bySourcePhase));
  assert.ok(Array.isArray(importObservability.payload?.recentErrors));
  assert.ok(
    importObservability.payload.bySourcePhase.some(
      (item) => item.sourceType === "csv" && item.phase === "commit" && item.events >= 1
    )
  );
  const importObservabilitySensitive = await apiRequest(
    "/api/metrics/import-observability?minEvents=1&duplicateRateThreshold=0.01",
    {
      cookies: authCookies
    }
  );
  assert.equal(importObservabilitySensitive.status, 200);
  assert.ok(Array.isArray(importObservabilitySensitive.payload?.alerts));
  assert.ok(
    importObservabilitySensitive.payload.alerts.some((item) =>
      ["high_error_rate", "high_duplicates_per_commit", "parser_unavailable_spike"].includes(item.code)
    )
  );

  const metricsAudit = await apiRequest(
    `/api/metrics/audit?from=${encodeURIComponent("2026-02-01T00:00:00.000Z")}&to=${encodeURIComponent("2026-02-28T23:59:59.999Z")}`,
    {
      cookies: authCookies
    }
  );
  assert.equal(metricsAudit.status, 200);
  assert.equal(metricsAudit.payload?.view, "metrics-audit");
  assert.equal(typeof metricsAudit.payload?.totals?.income, "number");
  assert.equal(typeof metricsAudit.payload?.totals?.expense, "number");
  assert.equal(typeof metricsAudit.payload?.totals?.net, "number");
  assert.ok(Array.isArray(metricsAudit.payload?.checks));

  const metricsAuditCsv = await apiRequest(
    `/api/metrics/audit?format=csv&from=${encodeURIComponent("2026-02-01T00:00:00.000Z")}&to=${encodeURIComponent("2026-02-28T23:59:59.999Z")}`,
    {
      cookies: authCookies
    }
  );
  assert.equal(metricsAuditCsv.status, 200);
  assert.equal(typeof metricsAuditCsv.payload, "string");
  assert.ok(metricsAuditCsv.payload.includes("key,expected,actual,difference,status"));
});
