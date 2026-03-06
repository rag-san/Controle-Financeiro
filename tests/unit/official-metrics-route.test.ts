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
  buildFingerprint: typeof import("@/lib/ledger/normalization").buildFingerprint;
  normalizeDescription: typeof import("@/lib/normalize").normalizeDescription;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  categoriesRepo: typeof import("@/lib/server/categories.repo").categoriesRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  formatRange: typeof import("@/src/features/cashflow/utils/cashflow").formatRange;
  resolveCurrentRange: typeof import("@/src/features/cashflow/utils/cashflow").resolveCurrentRange;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, authModule, routeModule, ledgerNormalizationModule, normalizeModule, usersModule, accountsModule, categoriesModule, ledgerModule, transactionsModule, cashflowModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/auth"),
          import("@/app/api/metrics/official/route"),
          import("@/lib/ledger/normalization"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/categories.repo"),
          import("@/lib/server/ledger.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/src/features/cashflow/utils/cashflow")
        ]);

      return {
        initDbOnce,
        db,
        AUTH_SECRET: authModule.AUTH_SECRET,
        GET: routeModule.GET,
        buildFingerprint: ledgerNormalizationModule.buildFingerprint,
        normalizeDescription: normalizeModule.normalizeDescription,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        categoriesRepo: categoriesModule.categoriesRepo,
        ledgerRepo: ledgerModule.ledgerRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
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
