import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const testDatabaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:55432/finance_test";

process.env.DATABASE_URL = testDatabaseUrl;
process.env.POSTGRES_URL = process.env.POSTGRES_URL?.trim() || testDatabaseUrl;

type LoadedDeps = {
  db: typeof import("@/lib/db").db;
  initDbOnce: typeof import("@/lib/db").initDbOnce;
  AUTH_SECRET: typeof import("@/lib/auth").AUTH_SECRET;
  normalizeDescription: typeof import("@/lib/normalize").normalizeDescription;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  categoriesRepo: typeof import("@/lib/server/categories.repo").categoriesRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  parseRoutePOST: typeof import("@/app/api/imports/parse/route").POST;
  commitRoutePOST: typeof import("@/app/api/imports/commit/route").POST;
  legacyImportRoutePOST: typeof import("@/app/api/import/route").POST;
  metricsOfficialGET: typeof import("@/app/api/metrics/official/route").GET;
  commitImportForUser: typeof import("@/lib/server/imports-commit.service").commitImportForUser;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, authModule, normalizeModule, usersModule, accountsModule, categoriesModule, transactionsModule, parseRouteModule, commitRouteModule, legacyImportRouteModule, metricsRouteModule, importsCommitModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/auth"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/categories.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/app/api/imports/parse/route"),
          import("@/app/api/imports/commit/route"),
          import("@/app/api/import/route"),
          import("@/app/api/metrics/official/route"),
          import("@/lib/server/imports-commit.service")
        ]);

      return {
        db,
        initDbOnce,
        AUTH_SECRET: authModule.AUTH_SECRET,
        normalizeDescription: normalizeModule.normalizeDescription,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        categoriesRepo: categoriesModule.categoriesRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        parseRoutePOST: parseRouteModule.POST,
        commitRoutePOST: commitRouteModule.POST,
        legacyImportRoutePOST: legacyImportRouteModule.POST,
        metricsOfficialGET: metricsRouteModule.GET,
        commitImportForUser: importsCommitModule.commitImportForUser
      };
    })();
  }

  return depsPromise;
}

async function requireDeps(t: import("node:test").TestContext): Promise<LoadedDeps | null> {
  try {
    const deps = await loadDeps();
    await deps.initDbOnce();
    return deps;
  } catch (error) {
    t.skip(
      `Database unavailable for import autocategorization tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

async function createFixture(prefix: string): Promise<{
  userId: string;
  email: string;
  name: string;
  accountId: string;
}> {
  const deps = await loadDeps();
  const user = await deps.usersRepo.create({
    email: `${prefix}.${Date.now()}@example.com`,
    name: `${prefix}-user`,
    password: null
  });
  assert.ok(user);

  const account = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-conta`,
    type: "checking",
    institution: "QA"
  });
  assert.ok(account);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    accountId: account.id
  };
}

async function createUserOnly(prefix: string): Promise<{
  userId: string;
  email: string;
  name: string;
}> {
  const deps = await loadDeps();
  const user = await deps.usersRepo.create({
    email: `${prefix}.${Date.now()}@example.com`,
    name: `${prefix}-user`,
    password: null
  });
  assert.ok(user);

  return {
    userId: user.id,
    email: user.email,
    name: user.name
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

async function buildAuthenticatedMultipartRequest(
  path: string,
  user: { userId: string; email: string; name: string },
  secret: string | undefined,
  formData: FormData
): Promise<NextRequest> {
  const token = await encode({
    secret: secret ?? "test-secret",
    token: {
      sub: user.userId,
      email: user.email,
      name: user.name
    },
    maxAge: 60 * 60
  });

  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`
    },
    body: formData
  });
}

async function buildAuthenticatedJsonRequest(
  path: string,
  user: { userId: string; email: string; name: string },
  secret: string | undefined,
  body: unknown
): Promise<NextRequest> {
  const token = await encode({
    secret: secret ?? "test-secret",
    token: {
      sub: user.userId,
      email: user.email,
      name: user.name
    },
    maxAge: 60 * 60
  });

  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function buildAuthenticatedGetRequest(
  path: string,
  user: { userId: string; email: string; name: string },
  secret: string | undefined
): Promise<NextRequest> {
  const token = await encode({
    secret: secret ?? "test-secret",
    token: {
      sub: user.userId,
      email: user.email,
      name: user.name
    },
    maxAge: 60 * 60
  });

  return new NextRequest(`http://localhost:3000${path}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
}

test("parse route reuses trusted merchant history in preview suggestions", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-parse-autocat");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const restaurants = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: "Restaurantes",
    color: "#f59e0b"
  });
  assert.ok(restaurants);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.accountId,
    categoryId: restaurants.id,
    date: new Date("2026-03-01T12:00:00.000Z"),
    description: "Padaria Sao Jose",
    normalizedDescription: deps.normalizeDescription("Padaria Sao Jose"),
    amount: -18.9,
    type: "expense",
    status: "posted",
    raw: {
      merchantKey: "padaria sao jose",
      categorySource: "manual"
    }
  });

  const csvBuffer = Buffer.from(
    ["Date,Description,Amount", "2026-03-15,Mercado Pago * Padaria Sao Jose,-22.50"].join("\n"),
    "utf8"
  );
  const formData = new FormData();
  formData.set("file", new File([csvBuffer], "historico-merchant.csv", { type: "text/csv" }));

  const response = await deps.parseRoutePOST(
    await buildAuthenticatedMultipartRequest("/api/imports/parse", fixture, deps.AUTH_SECRET, formData)
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload?.rows?.[0]?.categoryId, restaurants.id);
  assert.equal(payload?.rows?.[0]?.categorySource, "history");
  assert.equal(payload?.rows?.[0]?.categoryConfidence, "high");
  assert.equal(payload?.rows?.[0]?.raw?.merchantKey, "padaria sao jose");
});

test("parse preview rows can be committed unchanged without frontend value normalization", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-contract");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const csvBuffer = Buffer.from(
    [
      "Data,Historico,Descricao,Valor,Conta,Saldo,Documento",
      "2026-04-01,Pix recebido,Cliente Contrato,\"R$ 100,00\",Conta QA Contrato,\"R$ 100,00\",DOC-1",
      "2026-04-02,Compra no debito,Mercado Contrato,\"-R$ 40,00\",Conta QA Contrato,\"R$ 60,00\",DOC-2"
    ].join("\n"),
    "utf8"
  );
  const formData = new FormData();
  formData.set("file", new File([csvBuffer], "contract-flow.csv", { type: "text/csv" }));

  const parseResponse = await deps.parseRoutePOST(
    await buildAuthenticatedMultipartRequest("/api/imports/parse", fixture, deps.AUTH_SECRET, formData)
  );

  assert.equal(parseResponse.status, 200);
  const parsePayload = await parseResponse.json();
  assert.equal(parsePayload?.needsMapping, false);
  assert.equal(parsePayload?.rows?.length, 2);
  assert.equal(parsePayload?.preview?.[0]?.commitIndex, 0);
  assert.equal(parsePayload?.preview?.[1]?.commitIndex, 1);
  assert.equal(parsePayload?.rows?.[0]?.date, "2026-04-01T12:00:00.000Z");
  assert.equal(parsePayload?.rows?.[0]?.amount, 100);
  assert.equal(parsePayload?.rows?.[0]?.externalId, "DOC-1");
  assert.equal(parsePayload?.rows?.[0]?.transactionKindRaw, "Pix recebido");
  assert.equal(parsePayload?.rows?.[0]?.counterpartyRaw, "Cliente Contrato");
  assert.equal(parsePayload?.rows?.[0]?.raw?.Documento, "DOC-1");
  assert.equal(parsePayload?.rows?.[1]?.date, "2026-04-02T12:00:00.000Z");
  assert.equal(parsePayload?.rows?.[1]?.amount, -40);
  assert.equal(parsePayload?.rows?.[1]?.balanceAfter, 60);

  const commitResponse = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, {
      sourceType: parsePayload.sourceType,
      fileName: "contract-flow.csv",
      defaultAccountId: fixture.accountId,
      applyRules: false,
      rows: parsePayload.rows
    })
  );

  assert.equal(commitResponse.status, 201);
  const commitPayload = await commitResponse.json();
  assert.equal(commitPayload?.totalReceived, 2);
  assert.equal(commitPayload?.totalImported, 2);
  assert.equal(commitPayload?.statementReconciliation?.anchoredAccountCount, 1);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  assert.equal(transactions.length, 2);
  const persisted = transactions.find((item) => item.externalId === "DOC-1");
  assert.ok(persisted);
  assert.equal(persisted?.date.toISOString(), "2026-04-01T12:00:00.000Z");
  assert.equal(persisted?.amount, 100);
  assert.equal(persisted?.raw?.transactionKindRaw, "Pix recebido");
});

test("CSV parse supports manual column mapping before commit", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-manual-mapping");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const csvBuffer = Buffer.from(
    [
      "Quando,Quem,Quanto,Sobra",
      "2026-04-03,Cliente Manual,\"R$ 200,00\",\"R$ 200,00\"",
      "2026-04-04,Mercado Manual,\"-R$ 80,00\",\"R$ 120,00\""
    ].join("\n"),
    "utf8"
  );
  const firstFormData = new FormData();
  firstFormData.set("file", new File([csvBuffer], "manual-mapping.csv", { type: "text/csv" }));

  const firstParseResponse = await deps.parseRoutePOST(
    await buildAuthenticatedMultipartRequest("/api/imports/parse", fixture, deps.AUTH_SECRET, firstFormData)
  );
  assert.equal(firstParseResponse.status, 200);
  const firstParsePayload = await firstParseResponse.json();
  assert.equal(firstParsePayload?.needsMapping, true);
  assert.deepEqual(firstParsePayload?.columns, ["Quando", "Quem", "Quanto", "Sobra"]);

  const mappedFormData = new FormData();
  mappedFormData.set("file", new File([csvBuffer], "manual-mapping.csv", { type: "text/csv" }));
  mappedFormData.set(
    "mapping",
    JSON.stringify({
      date: "Quando",
      description: "Quem",
      amount: "Quanto",
      balanceAfter: "Sobra"
    })
  );

  const mappedParseResponse = await deps.parseRoutePOST(
    await buildAuthenticatedMultipartRequest("/api/imports/parse", fixture, deps.AUTH_SECRET, mappedFormData)
  );
  assert.equal(mappedParseResponse.status, 200);
  const mappedParsePayload = await mappedParseResponse.json();
  assert.equal(mappedParsePayload?.needsMapping, false);
  assert.equal(mappedParsePayload?.rows?.length, 2);
  assert.equal(mappedParsePayload?.rows?.[0]?.amount, 200);
  assert.equal(mappedParsePayload?.rows?.[1]?.amount, -80);
  assert.equal(mappedParsePayload?.rows?.[1]?.balanceAfter, 120);

  const commitResponse = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, {
      sourceType: mappedParsePayload.sourceType,
      fileName: "manual-mapping.csv",
      defaultAccountId: fixture.accountId,
      applyRules: false,
      rows: mappedParsePayload.rows
    })
  );

  assert.equal(commitResponse.status, 201);
  const commitPayload = await commitResponse.json();
  assert.equal(commitPayload?.totalImported, 2);
  assert.equal(commitPayload?.statementReconciliation?.anchoredAccountCount, 1);
});

test("legacy import route is disabled in favor of parse and commit", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-legacy-disabled");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const response = await deps.legacyImportRoutePOST(
    await buildAuthenticatedJsonRequest("/api/import", fixture, deps.AUTH_SECRET, {
      kind: "BANK_STATEMENT",
      filename: "legacy.csv",
      rows: [
        {
          postedAt: "2026-04-01",
          amount: 100,
          description: "Legacy import"
        }
      ]
    })
  );

  assert.equal(response.status, 410);
  const payload = await response.json();
  assert.equal(payload?.code, "legacy_import_route_disabled");
  assert.equal(payload?.officialFlow?.parse, "/api/imports/parse");
});

test("commit import persists categorization reason and confidence from the shared engine", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-commit-autocat");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const subscriptions = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: "Assinaturas",
    color: "#2563eb"
  });
  assert.ok(subscriptions);

  const commitResult = await deps.commitImportForUser(fixture.userId, {
    sourceType: "csv",
    fileName: "subscriptions.csv",
    defaultAccountId: fixture.accountId,
    applyRules: true,
    applyLocalAi: false,
    rows: [
      {
        date: "2026-03-20",
        description: "PayPal Netflix",
        amount: -39.9,
        transactionKindRaw: "Compra no debito",
        counterpartyRaw: "PayPal Netflix"
      }
    ]
  });

  assert.equal(commitResult.totalImported, 1);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  const imported = transactions.find((item) => item.description === "PayPal Netflix");
  assert.ok(imported);
  assert.equal(imported.categoryId, subscriptions.id);
  assert.equal(imported.raw?.categorySource, "builtin_rule");
  assert.equal(imported.raw?.categorizationConfidence, "high");
  assert.match(String(imported.raw?.categorizationReason ?? ""), /assinatura/i);
});

test("real CSV import auto-creates the missing account and becomes visible in official metrics", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createUserOnly("imports-real-csv");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const filePath = path.resolve(
    process.cwd(),
    "Arquivosdeexemplo",
    "csv",
    "Extrato-18-12-2025-a-18-01-2026-CSV.csv"
  );

  let fixtureBuffer: Buffer;
  try {
    fixtureBuffer = await fs.readFile(filePath);
  } catch {
    t.skip(`Real fixture unavailable: ${filePath}`);
    return;
  }

  const formData = new FormData();
  formData.set("file", new File([new Uint8Array(fixtureBuffer)], path.basename(filePath), { type: "text/csv" }));

  const parseResponse = await deps.parseRoutePOST(
    await buildAuthenticatedMultipartRequest("/api/imports/parse", fixture, deps.AUTH_SECRET, formData)
  );

  assert.equal(parseResponse.status, 200);
  const parsePayload = await parseResponse.json();
  assert.match(String(parsePayload?.accountHint ?? ""), /176057846/);
  assert.ok(Array.isArray(parsePayload?.rows));
  assert.ok(parsePayload.rows.length > 0);

  const commitResult = await deps.commitImportForUser(fixture.userId, {
    sourceType: "csv",
    fileName: path.basename(filePath),
    applyRules: false,
    applyLocalAi: false,
    rows: parsePayload.rows
  });

  assert.ok(commitResult.totalImported > 0);
  assert.equal(commitResult.autoCreatedAccounts?.checking, 1);
  assert.ok((commitResult.autoCreatedAccounts?.credit ?? 0) >= 1);

  const accounts = await deps.accountsRepo.listByUser(fixture.userId);
  assert.ok(accounts.length >= 2);
  assert.ok(accounts.some((account) => /176057846/.test(account.name)));
  assert.ok(accounts.some((account) => account.type === "credit"));

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  assert.ok(transactions.length > 0);

  const metricsResponse = await deps.metricsOfficialGET(
    await buildAuthenticatedGetRequest("/api/metrics/official?view=reports&preset=ALL", fixture, deps.AUTH_SECRET)
  );
  assert.equal(metricsResponse.status, 200);
  const metricsPayload = await metricsResponse.json();
  assert.equal(metricsPayload?.view, "reports");
  assert.ok((metricsPayload?.model?.currentTotals?.income ?? 0) !== 0 || (metricsPayload?.model?.currentTotals?.expense ?? 0) !== 0);
});

test("real PDF invoice import auto-creates a credit account from parser metadata", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createUserOnly("imports-real-pdf");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const filePath = path.resolve(process.cwd(), "Arquivosdeexemplo", "pdf", "Nubank_2026-02-18.pdf");

  let fixtureBuffer: Buffer;
  try {
    fixtureBuffer = await fs.readFile(filePath);
  } catch {
    t.skip(`Real fixture unavailable: ${filePath}`);
    return;
  }

  const formData = new FormData();
  formData.set("file", new File([new Uint8Array(fixtureBuffer)], path.basename(filePath), { type: "application/pdf" }));

  const parseResponse = await deps.parseRoutePOST(
    await buildAuthenticatedMultipartRequest("/api/imports/parse", fixture, deps.AUTH_SECRET, formData)
  );

  if (parseResponse.status !== 200) {
    const payload = await parseResponse.json();
    t.skip(`Real PDF parser unavailable for local fixture: ${payload?.code ?? "unknown"}`);
    return;
  }

  const parsePayload = await parseResponse.json();
  assert.equal(parsePayload?.documentType, "credit_card_invoice");
  assert.equal(parsePayload?.metadata?.invoicePurchaseTotal, 373.97);
  assert.ok(Array.isArray(parsePayload?.rows));
  assert.ok(parsePayload.rows.length > 0);

  const commitResult = await deps.commitImportForUser(fixture.userId, {
    sourceType: "pdf",
    fileName: path.basename(filePath),
    applyRules: false,
    applyLocalAi: false,
    rows: parsePayload.rows
  });

  assert.ok(commitResult.totalImported > 0);
  assert.ok((commitResult.autoCreatedAccounts?.total ?? 0) >= 1);
  assert.equal(commitResult.autoCreatedAccounts?.checking, 0);
  assert.ok((commitResult.autoCreatedAccounts?.credit ?? 0) >= 1);
  assert.equal(commitResult.invoiceReconciliation?.checkedAccountCount, 1);
  assert.equal(commitResult.invoiceReconciliation?.mismatchCount, 0);

  const accounts = await deps.accountsRepo.listByUser(fixture.userId);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.type, "credit");
  assert.match(accounts[0]?.name ?? "", /nubank/i);
});

test("card payment imported from bank statement auto-creates and links a credit account before invoice import", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-card-payment-autolink");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  await deps.accountsRepo.update({
    id: fixture.accountId,
    userId: fixture.userId,
    name: "Conta Inter QA",
    institution: "Inter"
  });

  const statementCommit = await deps.commitImportForUser(fixture.userId, {
    sourceType: "csv",
    fileName: "inter-statement-card-payment.csv",
    defaultAccountId: fixture.accountId,
    applyRules: false,
    applyLocalAi: false,
    rows: [
      {
        date: "2026-03-05",
        description: "PAGAMENTO FATURA CARTAO INTER",
        amount: -250
      }
    ]
  });

  assert.equal(statementCommit.totalImported, 2);
  assert.equal(statementCommit.totalReceived, 1);
  assert.equal(statementCommit.sourceRows.valid, 1);
  assert.equal(statementCommit.createdRecords.transferLegs, 2);
  assert.equal(statementCommit.autoCreatedAccounts?.credit, 1);

  const accountsAfterStatement = await deps.accountsRepo.listByUser(fixture.userId);
  const creditAccount = accountsAfterStatement.find((account) => account.type === "credit");
  assert.ok(creditAccount);
  assert.equal(creditAccount?.parentAccountId, fixture.accountId);

  const invoiceCommit = await deps.commitImportForUser(fixture.userId, {
    sourceType: "pdf",
    fileName: "inter-invoice.pdf",
    defaultAccountId: fixture.accountId,
    applyRules: false,
    applyLocalAi: false,
    rows: [
      {
        date: "2026-03-06",
        description: "Compra credito Inter QA",
        amount: -250,
        documentType: "credit_card_invoice"
      }
    ]
  });

  assert.equal(invoiceCommit.totalImported, 1);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId,
    hideCardPaymentMirrorInflow: false
  });
  const cardPaymentLegs = transactions.filter((item) => item.description === "PAGAMENTO FATURA CARTAO INTER");
  assert.equal(cardPaymentLegs.length, 2);
  assert.ok(cardPaymentLegs.some((item) => item.accountId === fixture.accountId && item.amount === -250));
  assert.ok(cardPaymentLegs.some((item) => item.accountId === creditAccount?.id && item.amount === 250));

  const creditPurchase = transactions.find((item) => item.description === "Compra credito Inter QA");
  assert.ok(creditPurchase);
  assert.equal(creditPurchase?.accountId, creditAccount?.id);

  const dashboardResponse = await deps.metricsOfficialGET(
    await buildAuthenticatedGetRequest(
      "/api/metrics/official?view=dashboard&month=2026-03",
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(dashboardResponse.status, 200);
  const dashboardPayload = await dashboardResponse.json();
  assert.equal(dashboardPayload?.financeBreakdown?.cardPayments, 250);
  assert.equal(dashboardPayload?.financeBreakdown?.openCardDebt, 0);
});

test("invoice import relinks legacy card payments that were previously saved without a target credit account", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-card-payment-relink");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  await deps.accountsRepo.update({
    id: fixture.accountId,
    userId: fixture.userId,
    name: "Conta Inter Relink",
    institution: "Inter"
  });

  const orphanedPayment = await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.accountId,
    date: new Date("2026-03-04T12:00:00.000Z"),
    description: "PAGAMENTO FATURA CARTAO INTER",
    normalizedDescription: deps.normalizeDescription("PAGAMENTO FATURA CARTAO INTER"),
    amount: -400,
    type: "transfer",
    status: "posted",
    isInternalTransfer: true,
    transferFromAccountId: fixture.accountId,
    transferToAccountId: null,
    raw: {
      transferDetectedFromCardPayment: true
    }
  });
  assert.ok(orphanedPayment);

  const invoiceCommit = await deps.commitImportForUser(fixture.userId, {
    sourceType: "pdf",
    fileName: "inter-invoice-relink.pdf",
    defaultAccountId: fixture.accountId,
    applyRules: false,
    applyLocalAi: false,
    rows: [
      {
        date: "2026-03-06",
        description: "Compra credito Inter relink",
        amount: -400,
        documentType: "credit_card_invoice"
      }
    ]
  });

  assert.equal(invoiceCommit.totalImported, 1);
  assert.ok((invoiceCommit.warnings ?? []).some((item: string) => /resincronizados/i.test(item)));

  const accounts = await deps.accountsRepo.listByUser(fixture.userId);
  const creditAccount = accounts.find((account) => account.type === "credit");
  assert.ok(creditAccount);

  const updatedOrphan = await deps.transactionsRepo.findByIdForUser(orphanedPayment?.id ?? "", fixture.userId);
  assert.ok(updatedOrphan);
  assert.equal(updatedOrphan?.transferToAccountId, creditAccount?.id);

  const dashboardResponse = await deps.metricsOfficialGET(
    await buildAuthenticatedGetRequest(
      "/api/metrics/official?view=dashboard&month=2026-03",
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(dashboardResponse.status, 200);
  const dashboardPayload = await dashboardResponse.json();
  assert.equal(dashboardPayload?.financeBreakdown?.cardPayments, 400);
  assert.equal(dashboardPayload?.financeBreakdown?.openCardDebt, 0);
});

test("commit route blocks imports that still do not have a valid account binding", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createUserOnly("imports-missing-account");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const response = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, {
      sourceType: "csv",
      fileName: "missing-account.csv",
      rows: [
        {
          date: "2026-03-20",
          description: "Linha sem conta vinculavel",
          amount: -19.9
        }
      ]
    })
  );

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload?.code, "missing_account_binding");

  const accounts = await deps.accountsRepo.listByUser(fixture.userId);
  assert.equal(accounts.length, 0);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  assert.equal(transactions.length, 0);
});

test("commit route returns conflict instead of false success when the import only contains duplicates", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-duplicates-conflict");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const payload = {
    sourceType: "csv",
    fileName: "duplicates.csv",
    defaultAccountId: fixture.accountId,
    applyRules: false,
    rows: [
      {
        date: "2026-03-25",
        description: "Duplicado controlado",
        amount: -42.5
      }
    ]
  };

  const firstResponse = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, payload)
  );
  assert.equal(firstResponse.status, 201);

  const secondResponse = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, payload)
  );
  assert.equal(secondResponse.status, 409);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload?.code, "import_no_new_transactions");
});

test("commit route rejects statements whose running balance does not reconcile", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-reconciliation");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const response = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, {
      sourceType: "csv",
      fileName: "reconciliation-fail.csv",
      defaultAccountId: fixture.accountId,
      applyRules: false,
      rows: [
        {
          date: "2026-03-01",
          description: "Salario",
          amount: 1000,
          balanceAfter: 1000
        },
        {
          date: "2026-03-02",
          description: "Mercado",
          amount: -200,
          balanceAfter: 850
        }
      ]
    })
  );

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload?.code, "statement_reconciliation_failed");
  assert.equal(payload?.details?.mismatchCount, 1);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  assert.equal(transactions.length, 0);
});

test("commit route rejects credit card invoices whose purchases do not match the invoice total", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-invoice-reconciliation");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const response = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, {
      sourceType: "pdf",
      fileName: "invoice-reconciliation-fail.pdf",
      defaultAccountId: fixture.accountId,
      applyRules: false,
      rows: [
        {
          date: "2026-03-10",
          description: "Compra cartao divergente",
          amount: -100,
          documentType: "credit_card_invoice",
          raw: {
            importInvoicePurchaseTotal: 150
          }
        }
      ]
    })
  );

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload?.code, "invoice_reconciliation_failed");
  assert.equal(payload?.details?.mismatchCount, 1);
  assert.equal(payload?.details?.accounts?.[0]?.expectedPurchaseTotal, 150);
  assert.equal(payload?.details?.accounts?.[0]?.actualPurchaseTotal, 100);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  assert.equal(transactions.length, 0);
});

test("commit route persists confirmed statement balance snapshots", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("imports-confirmed-balance");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cleanupUser(fixture.userId);
  });

  const importPayload = {
    sourceType: "pdf",
    fileName: "confirmed-balance.pdf",
    defaultAccountId: fixture.accountId,
    applyRules: false,
    rows: [
      {
        date: "2026-04-10",
        description: "Pix recebido",
        amount: 1000,
        balanceAfter: 1000
      },
      {
        date: "2026-04-11",
        description: "Mercado",
        amount: -200,
        balanceAfter: 800
      }
    ]
  };

  const response = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, importPayload)
  );

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload?.statementReconciliation?.confirmedBalanceSnapshots, 1);

  const accounts = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  const account = accounts.find((item) => item.id === fixture.accountId);

  assert.ok(account);
  assert.equal(account.currentBalance, 800);
  assert.equal(account.confirmedBalance?.amount, 800);
  assert.equal(account.confirmedBalance?.fileName, "confirmed-balance.pdf");
  assert.equal(account.confirmedBalance?.difference, 0);

  const duplicateResponse = await deps.commitRoutePOST(
    await buildAuthenticatedJsonRequest("/api/imports/commit", fixture, deps.AUTH_SECRET, importPayload)
  );
  assert.equal(duplicateResponse.status, 201);
  const duplicatePayload = await duplicateResponse.json();
  assert.equal(duplicatePayload?.totalImported, 0);
  assert.equal(duplicatePayload?.statementReconciliation?.confirmedBalanceSnapshots, 1);

  const transactions = await deps.transactionsRepo.listAll({
    userId: fixture.userId
  });
  assert.equal(transactions.length, 2);
});
