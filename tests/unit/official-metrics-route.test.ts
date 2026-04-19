import assert from "node:assert/strict";
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
  initDbOnce: typeof import("@/lib/db").initDbOnce;
  db: typeof import("@/lib/db").db;
  AUTH_SECRET: typeof import("@/lib/auth").AUTH_SECRET;
  GET: typeof import("@/app/api/metrics/official/route").GET;
  invalidateFinanceCaches: typeof import("@/lib/cache-keys").invalidateFinanceCaches;
  buildFingerprint: typeof import("@/lib/ledger/normalization").buildFingerprint;
  normalizeDescription: typeof import("@/lib/normalize").normalizeDescription;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  categoriesRepo: typeof import("@/lib/server/categories.repo").categoriesRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  listTransactionsForUser: typeof import("@/lib/server/transactions.service").listTransactionsForUser;
  formatRange: typeof import("@/src/features/cashflow/utils/cashflow").formatRange;
  resolveCurrentRange: typeof import("@/src/features/cashflow/utils/cashflow").resolveCurrentRange;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, authModule, routeModule, cacheKeysModule, ledgerNormalizationModule, normalizeModule, usersModule, accountsModule, categoriesModule, ledgerModule, transactionsModule, transactionsServiceModule, cashflowModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/auth"),
          import("@/app/api/metrics/official/route"),
          import("@/lib/cache-keys"),
          import("@/lib/ledger/normalization"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/categories.repo"),
          import("@/lib/server/ledger.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/lib/server/transactions.service"),
          import("@/src/features/cashflow/utils/cashflow")
        ]);

      return {
        initDbOnce,
        db,
        AUTH_SECRET: authModule.AUTH_SECRET,
        GET: routeModule.GET,
        invalidateFinanceCaches: cacheKeysModule.invalidateFinanceCaches,
        buildFingerprint: ledgerNormalizationModule.buildFingerprint,
        normalizeDescription: normalizeModule.normalizeDescription,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        categoriesRepo: categoriesModule.categoriesRepo,
        ledgerRepo: ledgerModule.ledgerRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        listTransactionsForUser: transactionsServiceModule.listTransactionsForUser,
        formatRange: cashflowModule.formatRange,
        resolveCurrentRange: cashflowModule.resolveCurrentRange
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
      `Database unavailable for official metrics route tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

async function createFixtureUser(prefix: string): Promise<{
  userId: string;
  email: string;
  name: string;
  checkingAccountId: string;
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
    name: `${prefix}-checking`,
    type: "checking",
    institution: "QA"
  });
  assert.ok(account);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    checkingAccountId: account.id
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

async function insertLedgerEntry(input: {
  userId: string;
  postedAt: Date;
  amount: number;
  type: "income" | "expense" | "transfer" | "cc_purchase" | "cc_payment" | "fee" | "refund";
  direction?: "IN" | "OUT" | null;
  description: string;
  accountId?: string | null;
  creditCardAccountId?: string | null;
  categoryId?: string | null;
}): Promise<void> {
  const deps = await loadDeps();
  const descriptionNormalized = deps.normalizeDescription(input.description);

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: input.userId,
    postedAt: input.postedAt,
    amount: input.amount,
    direction: input.direction ?? null,
    type: input.type,
    descriptionNormalized,
    accountId: input.accountId ?? null,
    creditCardAccountId: input.creditCardAccountId ?? null,
    categoryId: input.categoryId ?? null,
    fingerprint: deps.buildFingerprint({
      postedAt: input.postedAt,
      amountCents: Math.round(Math.abs(input.amount) * 100),
      type: input.type,
      direction: input.direction ?? null,
      descriptionNormalized,
      accountId: input.accountId ?? null,
      creditCardAccountId: input.creditCardAccountId ?? null
    })
  });
}

async function buildAuthenticatedRequest(
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
    headers: {
      authorization: `Bearer ${token}`
    }
  });
}

test("official metrics route ignores excluded rows and opening balance adjustments", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-route");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado official-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const currentMonth = monthKey(now);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    date: utcDate(year, monthIndex, 1),
    description: "Ajuste saldo inicial excluido",
    normalizedDescription: deps.normalizeDescription("Ajuste saldo inicial excluido"),
    amount: 5000,
    type: "income",
    excluded: true,
    raw: {
      openingBalanceAdjustment: true
    },
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    date: utcDate(year, monthIndex, 2),
    description: "Salario oficial",
    normalizedDescription: deps.normalizeDescription("Salario oficial"),
    amount: 1000,
    type: "income",
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    date: utcDate(year, monthIndex, 3),
    description: "Mercado oficial",
    normalizedDescription: deps.normalizeDescription("Mercado oficial"),
    amount: -200,
    type: "expense",
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    date: utcDate(year, monthIndex, 4),
    description: "Mercado excluido",
    normalizedDescription: deps.normalizeDescription("Mercado excluido"),
    amount: -50,
    type: "expense",
    excluded: true,
    status: "posted"
  });

  const dashboardResponse = await deps.GET(
    await buildAuthenticatedRequest(`/api/metrics/official?view=dashboard&month=${currentMonth}`, fixture, deps.AUTH_SECRET)
  );
  assert.equal(dashboardResponse.status, 200);
  const dashboardPayload = await dashboardResponse.json();
  assert.equal(dashboardPayload.view, "dashboard");
  assert.equal(dashboardPayload.referenceMonth, currentMonth);
  assert.equal(dashboardPayload.cards.income, 1000);
  assert.equal(dashboardPayload.cards.expense, 200);
  assert.equal(dashboardPayload.cards.result, 800);
  assert.equal(dashboardPayload.topCategories[0]?.current ?? 0, 200);

  const reportsResponse = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=reports&preset=1M", fixture, deps.AUTH_SECRET)
  );
  assert.equal(reportsResponse.status, 200);
  const reportsPayload = await reportsResponse.json();
  assert.equal(reportsPayload.view, "reports");
  assert.equal(reportsPayload.model.currentTotals.income, 1000);
  assert.equal(reportsPayload.model.currentTotals.expense, 200);
  assert.equal(reportsPayload.model.currentTotals.net, 800);
  assert.equal(
    Number(
      reportsPayload.model.categorySpending.reduce(
        (sum: number, item: { value: number }) => sum + Number(item.value ?? 0),
        0
      ).toFixed(2)
    ),
    200
  );

  const categoriesResponse = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=categories&month=${currentMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(categoriesResponse.status, 200);
  const categoriesPayload = await categoriesResponse.json();
  assert.equal(categoriesPayload.view, "categories");
  assert.equal(categoriesPayload.aggregates.totalSpent, 200);
  assert.equal(categoriesPayload.aggregates.list[0]?.value ?? 0, 200);
});

test("official categories route uses ledger data when the month is fully mirrored", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-categories-ledger");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado categories ledger-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const currentMonth = monthKey(now);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 150,
    type: "expense",
    direction: "OUT",
    description: "Mercado categories ledger",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=categories&month=${currentMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "categories");
  assert.equal(payload.aggregates.totalSpent, 150);
  assert.equal(payload.aggregates.list[0]?.value ?? 0, 150);
  assert.equal(payload.aggregates.list[0]?.name, groceries.name);
});

test("official categories route nets ledger refunds inside category totals", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-categories-refund");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado categories refund-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const currentMonth = monthKey(now);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 200,
    type: "expense",
    direction: "OUT",
    description: "Mercado categories refund compra",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 50,
    type: "refund",
    direction: "IN",
    description: "Mercado categories refund estorno",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=categories&month=${currentMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "categories");
  assert.equal(payload.aggregates.totalSpent, 150);
  assert.equal(payload.aggregates.list[0]?.name, groceries.name);
  assert.equal(payload.aggregates.list[0]?.value ?? 0, 150);
});

test("official categories route stays on legacy data while the month has transactions without ledger mirror", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-categories-fallback");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado categories fallback-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const currentMonth = monthKey(now);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    date: utcDate(year, monthIndex, 2),
    description: "Mercado categories legado sem espelho",
    normalizedDescription: deps.normalizeDescription("Mercado categories legado sem espelho"),
    amount: -80,
    type: "expense",
    status: "posted"
  });

  const mirroredTx = await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    date: utcDate(year, monthIndex, 3),
    description: "Mercado categories com espelho",
    normalizedDescription: deps.normalizeDescription("Mercado categories com espelho"),
    amount: -120,
    type: "expense",
    status: "posted"
  });
  assert.ok(mirroredTx);

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 120,
    direction: "OUT",
    type: "expense",
    descriptionNormalized: deps.normalizeDescription("Mercado categories com espelho"),
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    externalRef: `LEGACY_TX:${mirroredTx.id}`,
    fingerprint: deps.buildFingerprint({
      postedAt: utcDate(year, monthIndex, 3),
      amountCents: 12000,
      type: "expense",
      direction: "OUT",
      descriptionNormalized: deps.normalizeDescription("Mercado categories com espelho"),
      accountId: fixture.checkingAccountId,
      creditCardAccountId: null
    })
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=categories&month=${currentMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "categories");
  assert.equal(payload.aggregates.totalSpent, 200);
  assert.equal(payload.aggregates.list[0]?.value ?? 0, 200);
  assert.equal(payload.aggregates.list[0]?.name, groceries.name);
});

test("official cashflow route anchors to latest included transaction and ignores excluded opening balance", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-cashflow");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const latestIncludedDate = utcDate(year, monthIndex, 3);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    date: utcDate(year, monthIndex, 2),
    description: "Receita valida cashflow",
    normalizedDescription: deps.normalizeDescription("Receita valida cashflow"),
    amount: 900,
    type: "income",
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    date: latestIncludedDate,
    description: "Despesa valida cashflow",
    normalizedDescription: deps.normalizeDescription("Despesa valida cashflow"),
    amount: -120,
    type: "expense",
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    date: utcDate(year, monthIndex, 4),
    description: "Ajuste saldo inicial excluido cashflow",
    normalizedDescription: deps.normalizeDescription("Ajuste saldo inicial excluido cashflow"),
    amount: 7000,
    type: "income",
    excluded: true,
    raw: {
      openingBalanceAdjustment: true
    },
    status: "posted"
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=cashflow&period=1m", fixture, deps.AUTH_SECRET)
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "cashflow");
  assert.equal(payload.data.income.current, 900);
  assert.equal(payload.data.expense.current, 120);
  assert.equal(payload.data.netResult.current, 780);

  const expectedRangeLabel = deps.formatRange(deps.resolveCurrentRange("1m", latestIncludedDate));
  assert.equal(payload.data.currentRangeLabel, expectedRangeLabel);
});

test("official reports and cashflow use ledger cash reality without duplicating card payment as expense", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-ledger-reality");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado ledger-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const daily = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Despesas do dia-${Date.now()}`,
    color: "#f97316"
  });
  assert.ok(daily);

  const card = await deps.ledgerRepo.createCreditCardAccount({
    userId: fixture.userId,
    name: `Cartao ledger-${Date.now()}`,
    defaultPaymentAccountId: fixture.checkingAccountId
  });
  assert.ok(card);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 1),
    amount: 1000,
    type: "income",
    direction: "IN",
    description: "Salario ledger",
    accountId: fixture.checkingAccountId
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 400,
    type: "cc_purchase",
    direction: "OUT",
    description: "Mercado cartao ledger",
    creditCardAccountId: card.id,
    categoryId: groceries.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 600,
    type: "expense",
    direction: "OUT",
    description: "Despesa em conta ledger",
    accountId: fixture.checkingAccountId,
    categoryId: daily.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 4),
    amount: 400,
    type: "cc_payment",
    direction: "OUT",
    description: "Pagamento fatura ledger",
    accountId: fixture.checkingAccountId,
    creditCardAccountId: card.id
  });

  const reportsResponse = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=reports&preset=1M", fixture, deps.AUTH_SECRET)
  );
  assert.equal(reportsResponse.status, 200);
  const reportsPayload = await reportsResponse.json();
  assert.equal(reportsPayload.view, "reports");
  assert.equal(reportsPayload.model.currentTotals.income, 1000);
  assert.equal(reportsPayload.model.currentTotals.expense, 1000);
  assert.equal(reportsPayload.model.currentTotals.net, 0);
  assert.equal(reportsPayload.model.cashSummary.cashBalance, 0);
  assert.equal(reportsPayload.model.cashSummary.outflow, 1000);
  assert.equal(reportsPayload.model.cashSummary.net, 0);
  assert.equal(
    reportsPayload.model.categorySpending.some((item: { name: string }) =>
      item.name.toLowerCase().includes("transfer")
    ),
    false
  );
  assert.equal(
    Number(
      reportsPayload.model.categorySpending.reduce(
        (sum: number, item: { value: number }) => sum + Number(item.value ?? 0),
        0
      ).toFixed(2)
    ),
    1000
  );

  const cashflowResponse = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=cashflow&period=1m", fixture, deps.AUTH_SECRET)
  );
  assert.equal(cashflowResponse.status, 200);
  const cashflowPayload = await cashflowResponse.json();
  assert.equal(cashflowPayload.view, "cashflow");
  assert.equal(cashflowPayload.data.cashBalance, 0);
  assert.equal(cashflowPayload.data.netResult.current, 0);
  assert.equal(cashflowPayload.data.income.current, 1000);
  assert.equal(cashflowPayload.data.expense.current, 1000);
});

test("official reports and cashflow keep card account filters out of cash totals while exposing card breakdown", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-card-filter");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado card filter-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const card = await deps.ledgerRepo.createCreditCardAccount({
    userId: fixture.userId,
    name: `Cartao filtro-${Date.now()}`,
    defaultPaymentAccountId: fixture.checkingAccountId
  });
  assert.ok(card);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 400,
    type: "cc_purchase",
    direction: "OUT",
    description: "Mercado cartao filtrado",
    creditCardAccountId: card.id,
    categoryId: groceries.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 4),
    amount: 150,
    type: "cc_payment",
    direction: "OUT",
    description: "Pagamento cartao filtrado",
    accountId: fixture.checkingAccountId,
    creditCardAccountId: card.id
  });

  const reportsResponse = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=reports&preset=1M&accountId=${card.id}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(reportsResponse.status, 200);
  const reportsPayload = await reportsResponse.json();
  assert.equal(reportsPayload.view, "reports");
  assert.equal(reportsPayload.model.currentTotals.expense, 400);
  assert.equal(reportsPayload.model.cashSummary.outflow, 0);
  assert.equal(reportsPayload.model.cashSummary.net, 0);
  assert.equal(reportsPayload.model.cashSummary.cashBalance, 0);
  assert.equal(reportsPayload.model.financeBreakdown.cardSpending, 400);
  assert.equal(reportsPayload.model.financeBreakdown.cardPayments, 150);
  assert.equal(reportsPayload.model.financeBreakdown.paidExpense, 150);
  assert.equal(reportsPayload.model.financeBreakdown.openCardDebt, 250);

  const cashflowResponse = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=cashflow&period=1m&accountId=${card.id}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(cashflowResponse.status, 200);
  const cashflowPayload = await cashflowResponse.json();
  assert.equal(cashflowPayload.view, "cashflow");
  assert.equal(cashflowPayload.data.income.current, 0);
  assert.equal(cashflowPayload.data.expense.current, 0);
  assert.equal(cashflowPayload.data.netResult.current, 0);
  assert.equal(cashflowPayload.data.classifiedExpense.current, 400);
  assert.equal(cashflowPayload.data.financeBreakdown.cardSpending, 400);
  assert.equal(cashflowPayload.data.financeBreakdown.cardPayments, 150);
  assert.equal(cashflowPayload.data.financeBreakdown.openCardDebt, 250);
});

test("official dashboard uses ledger data when no legacy transactions exist", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-dashboard-ledger");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado dashboard ledger-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const previousMonthDate = new Date(Date.UTC(year, monthIndex, 0, 12, 0, 0, 0));
  const previousYear = previousMonthDate.getUTCFullYear();
  const previousMonthIndex = previousMonthDate.getUTCMonth();
  const previousDay = previousMonthDate.getUTCDate();
  const currentMonth = monthKey(now);

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 1),
    amount: 900,
    type: "income",
    direction: "IN",
    description: "Salario dashboard ledger",
    accountId: fixture.checkingAccountId
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 220,
    type: "expense",
    direction: "OUT",
    description: "Mercado dashboard ledger atual",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(previousYear, previousMonthIndex, previousDay),
    amount: 80,
    type: "expense",
    direction: "OUT",
    description: "Mercado dashboard ledger anterior",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(`/api/metrics/official?view=dashboard&month=${currentMonth}`, fixture, deps.AUTH_SECRET)
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "dashboard");
  assert.equal(payload.referenceMonth, currentMonth);
  assert.equal(payload.previousReferenceMonth, monthKey(previousMonthDate));
  assert.equal(payload.referencePeriod.start.slice(0, 7), currentMonth);
  assert.equal(payload.comparisonPeriod.start.slice(0, 7), monthKey(previousMonthDate));
  assert.equal(payload.cards.income, 900);
  assert.equal(payload.cards.expense, 220);
  assert.equal(payload.cards.result, 680);
  assert.equal(payload.periodComparison.previous.expense, 80);
  assert.equal(payload.topCategories[0]?.current ?? 0, 220);
  assert.equal(payload.topCategories[0]?.previous ?? 0, 80);
});

test("official dashboard nets ledger refunds against category spend", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-dashboard-refund");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado dashboard refund-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const currentMonth = monthKey(now);

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 1),
    amount: 1000,
    type: "income",
    direction: "IN",
    description: "Salario dashboard refund",
    accountId: fixture.checkingAccountId
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 200,
    type: "expense",
    direction: "OUT",
    description: "Mercado dashboard refund compra",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 4),
    amount: 60,
    type: "refund",
    direction: "IN",
    description: "Mercado dashboard refund estorno",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(`/api/metrics/official?view=dashboard&month=${currentMonth}`, fixture, deps.AUTH_SECRET)
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "dashboard");
  assert.equal(payload.cards.income, 1000);
  assert.equal(payload.cards.expense, 140);
  assert.equal(payload.cards.result, 860);
  assert.equal(payload.topCategories[0]?.name, groceries.name);
  assert.equal(payload.topCategories[0]?.current ?? 0, 140);
});

test("official dashboard includes uncategorized spend among top categories", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-dashboard-uncategorized");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado dashboard uncategorized-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const currentMonth = monthKey(now);

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 90,
    type: "expense",
    direction: "OUT",
    description: "Despesa sem categoria dashboard",
    accountId: fixture.checkingAccountId
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 40,
    type: "expense",
    direction: "OUT",
    description: "Mercado dashboard categoria menor",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(`/api/metrics/official?view=dashboard&month=${currentMonth}`, fixture, deps.AUTH_SECRET)
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.view, "dashboard");
  assert.equal(payload.cards.expense, 130);
  assert.equal(payload.topCategories[0]?.name, "Sem categoria");
  assert.equal(payload.topCategories[0]?.current ?? 0, 90);
});

test("official dashboard refreshes historical month after finance mutations", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-dashboard-history-refresh");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado dashboard history-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12, 0, 0, 0));
  const previousMonth = monthKey(previousMonthDate);

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: new Date(Date.UTC(previousMonthDate.getUTCFullYear(), previousMonthDate.getUTCMonth(), 5, 12, 0, 0, 0)),
    amount: 80,
    type: "expense",
    direction: "OUT",
    description: "Mercado historico inicial",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  const firstResponse = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=dashboard&month=${previousMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(firstResponse.status, 200);
  const firstPayload = await firstResponse.json();
  assert.equal(firstPayload.view, "dashboard");
  assert.equal(firstPayload.referenceMonth, previousMonth);
  assert.equal(firstPayload.cards.expense, 80);
  assert.equal(firstPayload.topCategories[0]?.current ?? 0, 80);

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: new Date(Date.UTC(previousMonthDate.getUTCFullYear(), previousMonthDate.getUTCMonth(), 18, 12, 0, 0, 0)),
    amount: 45,
    type: "expense",
    direction: "OUT",
    description: "Mercado historico adicional",
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id
  });

  deps.invalidateFinanceCaches(fixture.userId);

  const refreshedResponse = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=dashboard&month=${previousMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(refreshedResponse.status, 200);
  const refreshedPayload = await refreshedResponse.json();
  assert.equal(refreshedPayload.view, "dashboard");
  assert.equal(refreshedPayload.referenceMonth, previousMonth);
  assert.equal(refreshedPayload.cards.expense, 125);
  assert.equal(refreshedPayload.topCategories[0]?.current ?? 0, 125);

  const transactionsSnapshot = await deps.listTransactionsForUser(fixture.userId, {
    period: "last-month",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(transactionsSnapshot.summary.income, refreshedPayload.cards.income);
  assert.equal(transactionsSnapshot.summary.expense, refreshedPayload.cards.expense);
  assert.equal(transactionsSnapshot.summary.balance, refreshedPayload.cards.result);
});

test("accounts repo exposes ledger-backed current balance when the user is fully mirrored", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-accounts-ledger");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 1500,
    type: "income",
    direction: "IN",
    description: "Salario accounts ledger",
    accountId: fixture.checkingAccountId
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 5),
    amount: 320,
    type: "expense",
    direction: "OUT",
    description: "Mercado accounts ledger",
    accountId: fixture.checkingAccountId
  });

  const accounts = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  const checking = accounts.find((account) => account.id === fixture.checkingAccountId);

  assert.ok(checking);
  assert.equal(checking?.currentBalance ?? 0, 1180);
});

test("official analytics stay on legacy data while the compared range still has transactions without ledger mirror", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("official-legacy-fallback");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado fallback-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const previousMonthDate = new Date(Date.UTC(year, monthIndex, 0, 12, 0, 0, 0));
  const previousYear = previousMonthDate.getUTCFullYear();
  const previousMonthIndex = previousMonthDate.getUTCMonth();
  const previousDay = previousMonthDate.getUTCDate();
  const currentMonth = monthKey(now);

  const previousTx = await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    date: utcDate(previousYear, previousMonthIndex, previousDay),
    description: "Mercado legado sem espelho",
    normalizedDescription: deps.normalizeDescription("Mercado legado sem espelho"),
    amount: -80,
    type: "expense",
    status: "posted"
  });
  assert.ok(previousTx);

  const currentTx = await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    date: utcDate(year, monthIndex, 3),
    description: "Mercado atual com espelho",
    normalizedDescription: deps.normalizeDescription("Mercado atual com espelho"),
    amount: -120,
    type: "expense",
    status: "posted"
  });
  assert.ok(currentTx);

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 120,
    direction: "OUT",
    type: "expense",
    descriptionNormalized: deps.normalizeDescription("Mercado atual com espelho"),
    accountId: fixture.checkingAccountId,
    categoryId: groceries.id,
    externalRef: `LEGACY_TX:${currentTx.id}`,
    fingerprint: deps.buildFingerprint({
      postedAt: utcDate(year, monthIndex, 3),
      amountCents: 12000,
      type: "expense",
      direction: "OUT",
      descriptionNormalized: deps.normalizeDescription("Mercado atual com espelho"),
      accountId: fixture.checkingAccountId,
      creditCardAccountId: null
    })
  });

  const dashboardResponse = await deps.GET(
    await buildAuthenticatedRequest(`/api/metrics/official?view=dashboard&month=${currentMonth}`, fixture, deps.AUTH_SECRET)
  );
  assert.equal(dashboardResponse.status, 200);
  const dashboardPayload = await dashboardResponse.json();
  assert.equal(dashboardPayload.view, "dashboard");
  assert.equal(dashboardPayload.cards.expense, 120);
  assert.equal(dashboardPayload.periodComparison.previous.expense, 80);
  assert.equal(dashboardPayload.topCategories[0]?.previous ?? 0, 80);

  const reportsResponse = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=reports&preset=1M", fixture, deps.AUTH_SECRET)
  );
  assert.equal(reportsResponse.status, 200);
  const reportsPayload = await reportsResponse.json();
  assert.equal(reportsPayload.view, "reports");
  assert.equal(reportsPayload.model.currentTotals.expense, 120);
  assert.equal(reportsPayload.model.previousTotals.expense, 80);

  const cashflowResponse = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=cashflow&period=1m", fixture, deps.AUTH_SECRET)
  );
  assert.equal(cashflowResponse.status, 200);
  const cashflowPayload = await cashflowResponse.json();
  assert.equal(cashflowPayload.view, "cashflow");
  assert.equal(cashflowPayload.data.expense.current, 120);
  assert.equal(cashflowPayload.data.expense.previous, 80);
});
