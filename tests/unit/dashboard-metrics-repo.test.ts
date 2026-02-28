import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:55432/finance_test";

process.env.DATABASE_URL = testDatabaseUrl;
process.env.POSTGRES_URL = process.env.POSTGRES_URL?.trim() || testDatabaseUrl;

type LoadedDeps = {
  db: typeof import("@/lib/db").db;
  initDbOnce: typeof import("@/lib/db").initDbOnce;
  normalizeDescription: typeof import("@/lib/normalize").normalizeDescription;
  dashboardMetricsRepo: typeof import("@/lib/server/dashboard-metrics.repo").dashboardMetricsRepo;
  resolveDashboardDateRange: typeof import("@/lib/server/dashboard-metrics.repo").resolveDashboardDateRange;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  categoriesRepo: typeof import("@/lib/server/categories.repo").categoriesRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, normalizeModule, dashboardMetricsModule, accountsModule, categoriesModule, transactionsModule, usersModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/normalize"),
          import("@/lib/server/dashboard-metrics.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/categories.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/lib/server/users.repo")
        ]);

      return {
        db,
        initDbOnce,
        normalizeDescription: normalizeModule.normalizeDescription,
        dashboardMetricsRepo: dashboardMetricsModule.dashboardMetricsRepo,
        resolveDashboardDateRange: dashboardMetricsModule.resolveDashboardDateRange,
        accountsRepo: accountsModule.accountsRepo,
        categoriesRepo: categoriesModule.categoriesRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        usersRepo: usersModule.usersRepo
      };
    })();
  }

  return depsPromise;
}

async function createFixtureUser(prefix: string) {
  const deps = await loadDeps();
  const user = await deps.usersRepo.create({
    email: `${prefix}.${Date.now()}@example.com`,
    name: `${prefix}-user`,
    password: null
  });
  assert.ok(user);

  const primaryAccount = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-conta-principal`,
    type: "checking",
    institution: "QA"
  });
  const secondaryAccount = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-conta-secundaria`,
    type: "checking",
    institution: "QA"
  });
  assert.ok(primaryAccount);
  assert.ok(secondaryAccount);

  return {
    userId: user.id,
    primaryAccountId: primaryAccount.id,
    secondaryAccountId: secondaryAccount.id
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

async function requireDeps(t: import("node:test").TestContext): Promise<LoadedDeps | null> {
  try {
    const deps = await loadDeps();
    await deps.initDbOnce();
    return deps;
  } catch (error) {
    t.skip(
      `Database unavailable for dashboard metrics tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

test("dashboard summary ignores transfers and separates excluded amounts", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;
  const fixture = await createFixtureUser("dashboard-summary");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado-${Date.now()}`,
    color: "#22c55e"
  });
  assert.ok(groceries);

  const range = deps.resolveDashboardDateRange({
    from: new Date("2026-02-10T00:00:00.000Z"),
    to: new Date("2026-02-16T00:00:00.000Z")
  });

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: null,
    date: new Date("2026-02-10T12:00:00.000Z"),
    description: "Salario",
    normalizedDescription: deps.normalizeDescription("Salario"),
    amount: 1000,
    type: "income",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-11T12:00:00.000Z"),
    description: "Mercado semana",
    normalizedDescription: deps.normalizeDescription("Mercado semana"),
    amount: -400,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-12T12:00:00.000Z"),
    description: "Compra excluida",
    normalizedDescription: deps.normalizeDescription("Compra excluida"),
    amount: -120,
    type: "expense",
    excluded: true,
    status: "posted"
  });
  const transferPair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.primaryAccountId,
    toAccountId: fixture.secondaryAccountId,
    date: new Date("2026-02-13T12:00:00.000Z"),
    description: "Transferencia interna",
    normalizedDescription: deps.normalizeDescription("Transferencia interna"),
    amount: 200,
    status: "posted"
  });
  assert.equal(transferPair.created, true);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: null,
    date: new Date("2026-02-04T12:00:00.000Z"),
    description: "Salario anterior",
    normalizedDescription: deps.normalizeDescription("Salario anterior"),
    amount: 700,
    type: "income",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-05T12:00:00.000Z"),
    description: "Mercado anterior",
    normalizedDescription: deps.normalizeDescription("Mercado anterior"),
    amount: -300,
    type: "expense",
    excluded: false,
    status: "posted"
  });

  const summary = await deps.dashboardMetricsRepo.getSummary({
    userId: fixture.userId,
    range
  });

  assert.equal(summary.totalIncome, 1000);
  assert.equal(summary.totalExpense, 400);
  assert.equal(summary.net, 600);
  assert.equal(summary.excludedTotal, 120);
  assert.equal(summary.previousPeriodComparison.previousIncome, 700);
  assert.equal(summary.previousPeriodComparison.previousExpense, 300);
  assert.equal(summary.previousPeriodComparison.previousNet, 400);
  assert.equal(summary.previousPeriodComparison.delta, 200);
  assert.equal(summary.previousPeriodComparison.percent, 50);
});

test("dashboard categories/trends/patrimony return stable empty states", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;
  const fixture = await createFixtureUser("dashboard-empty");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const range = deps.resolveDashboardDateRange({
    from: new Date("2026-02-01T00:00:00.000Z"),
    to: new Date("2026-02-07T00:00:00.000Z")
  });

  const categories = await deps.dashboardMetricsRepo.getTopCategories({
    userId: fixture.userId,
    range
  });
  assert.deepEqual(categories.topCategories, []);

  const trends = await deps.dashboardMetricsRepo.getTrends({
    userId: fixture.userId,
    range,
    granularity: "day"
  });
  assert.equal(trends.series.length, 7);
  assert.ok(trends.series.every((item) => item.income === 0 && item.expense === 0 && item.net === 0));
  assert.equal(trends.previousSeries.length, 7);
  assert.ok(trends.previousSeries.every((item) => item.income === 0 && item.expense === 0 && item.net === 0));

  const patrimony = await deps.dashboardMetricsRepo.getPatrimony({
    userId: fixture.userId,
    range,
    granularity: "day"
  });
  assert.equal(patrimony.series.length, 7);
  assert.ok(patrimony.series.every((item) => item.value === 0));
});

test("patrimony series uses baseline and keeps internal transfers neutral", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;
  const fixture = await createFixtureUser("dashboard-patrimony");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const range = deps.resolveDashboardDateRange({
    from: new Date("2026-02-10T00:00:00.000Z"),
    to: new Date("2026-02-13T00:00:00.000Z")
  });

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    date: new Date("2026-02-05T12:00:00.000Z"),
    description: "Base inicial",
    normalizedDescription: deps.normalizeDescription("Base inicial"),
    amount: 500,
    type: "income",
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    date: new Date("2026-02-10T12:00:00.000Z"),
    description: "Despesa dia 10",
    normalizedDescription: deps.normalizeDescription("Despesa dia 10"),
    amount: -100,
    type: "expense",
    status: "posted"
  });
  const transferPair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.primaryAccountId,
    toAccountId: fixture.secondaryAccountId,
    date: new Date("2026-02-11T12:00:00.000Z"),
    description: "Transferencia interna dia 11",
    normalizedDescription: deps.normalizeDescription("Transferencia interna dia 11"),
    amount: 50,
    status: "posted"
  });
  assert.equal(transferPair.created, true);
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    date: new Date("2026-02-12T12:00:00.000Z"),
    description: "Receita dia 12",
    normalizedDescription: deps.normalizeDescription("Receita dia 12"),
    amount: 25,
    type: "income",
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    date: new Date("2026-02-12T15:00:00.000Z"),
    description: "Receita excluida",
    normalizedDescription: deps.normalizeDescription("Receita excluida"),
    amount: 100,
    type: "income",
    excluded: true,
    status: "posted"
  });

  const patrimony = await deps.dashboardMetricsRepo.getPatrimony({
    userId: fixture.userId,
    range,
    granularity: "day"
  });

  assert.deepEqual(
    patrimony.series.map((item) => item.value),
    [400, 400, 425, 425]
  );
});

test("dashboard metrics apply account/type/category/search/excluded filters consistently", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;
  const fixture = await createFixtureUser("dashboard-filters");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado filtro-${Date.now()}`,
    color: "#10b981"
  });
  const travel = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Viagem filtro-${Date.now()}`,
    color: "#f97316"
  });
  assert.ok(groceries);
  assert.ok(travel);

  const range = deps.resolveDashboardDateRange({
    from: new Date("2026-02-10T00:00:00.000Z"),
    to: new Date("2026-02-16T00:00:00.000Z")
  });

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: null,
    date: new Date("2026-02-10T10:00:00.000Z"),
    description: "Salario principal",
    normalizedDescription: deps.normalizeDescription("Salario principal"),
    amount: 900,
    type: "income",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-11T10:00:00.000Z"),
    description: "Mercado alvo",
    normalizedDescription: deps.normalizeDescription("Mercado alvo"),
    amount: -100,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.secondaryAccountId,
    categoryId: travel.id,
    date: new Date("2026-02-12T10:00:00.000Z"),
    description: "Viagem lazer",
    normalizedDescription: deps.normalizeDescription("Viagem lazer"),
    amount: -250,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-13T10:00:00.000Z"),
    description: "Mercado excluido",
    normalizedDescription: deps.normalizeDescription("Mercado excluido"),
    amount: -40,
    type: "expense",
    excluded: true,
    status: "posted"
  });
  const pair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.primaryAccountId,
    toAccountId: fixture.secondaryAccountId,
    date: new Date("2026-02-14T10:00:00.000Z"),
    description: "Transferencia interna filtro",
    normalizedDescription: deps.normalizeDescription("Transferencia interna filtro"),
    amount: 70,
    status: "posted"
  });
  assert.equal(pair.created, true);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: null,
    date: new Date("2026-02-05T10:00:00.000Z"),
    description: "Salario anterior",
    normalizedDescription: deps.normalizeDescription("Salario anterior"),
    amount: 300,
    type: "income",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-06T10:00:00.000Z"),
    description: "Mercado anterior",
    normalizedDescription: deps.normalizeDescription("Mercado anterior"),
    amount: -60,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.secondaryAccountId,
    categoryId: travel.id,
    date: new Date("2026-02-07T10:00:00.000Z"),
    description: "Viagem anterior",
    normalizedDescription: deps.normalizeDescription("Viagem anterior"),
    amount: -30,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-08T10:00:00.000Z"),
    description: "Mercado excluido anterior",
    normalizedDescription: deps.normalizeDescription("Mercado excluido anterior"),
    amount: -20,
    type: "expense",
    excluded: true,
    status: "posted"
  });

  const accountSummary = await deps.dashboardMetricsRepo.getSummary({
    userId: fixture.userId,
    range,
    filters: { accountId: fixture.primaryAccountId }
  });
  assert.equal(accountSummary.totalIncome, 900);
  assert.equal(accountSummary.totalExpense, 100);
  assert.equal(accountSummary.excludedTotal, 40);
  assert.equal(accountSummary.previousPeriodComparison.previousIncome, 300);
  assert.equal(accountSummary.previousPeriodComparison.previousExpense, 60);

  const searchSummary = await deps.dashboardMetricsRepo.getSummary({
    userId: fixture.userId,
    range,
    filters: { normalizedQuery: deps.normalizeDescription("mercado") }
  });
  assert.equal(searchSummary.totalIncome, 0);
  assert.equal(searchSummary.totalExpense, 100);
  assert.equal(searchSummary.excludedTotal, 40);
  assert.equal(searchSummary.previousPeriodComparison.previousExpense, 60);

  const excludedOnlySummary = await deps.dashboardMetricsRepo.getSummary({
    userId: fixture.userId,
    range,
    filters: { excluded: true, normalizedQuery: deps.normalizeDescription("mercado") }
  });
  assert.equal(excludedOnlySummary.totalIncome, 0);
  assert.equal(excludedOnlySummary.totalExpense, 40);
  assert.equal(excludedOnlySummary.previousPeriodComparison.previousExpense, 20);
  assert.equal(excludedOnlySummary.excludedTotal, 40);

  const incomeOnlySummary = await deps.dashboardMetricsRepo.getSummary({
    userId: fixture.userId,
    range,
    filters: { type: "income", accountId: fixture.primaryAccountId }
  });
  assert.equal(incomeOnlySummary.totalIncome, 900);
  assert.equal(incomeOnlySummary.totalExpense, 0);

  const accountCategories = await deps.dashboardMetricsRepo.getTopCategories({
    userId: fixture.userId,
    range,
    filters: { accountId: fixture.primaryAccountId }
  });
  assert.equal(accountCategories.topCategories.length, 1);
  assert.equal(accountCategories.topCategories[0]?.name, groceries.name);
  assert.equal(accountCategories.topCategories[0]?.total, 100);
  assert.equal(accountCategories.topCategories[0]?.previousTotal, 60);

  const filteredTrends = await deps.dashboardMetricsRepo.getTrends({
    userId: fixture.userId,
    range,
    granularity: "day",
    filters: { accountId: fixture.primaryAccountId, type: "expense" }
  });
  const trendsIncome = filteredTrends.series.reduce((sum, point) => sum + point.income, 0);
  const trendsExpense = filteredTrends.series.reduce((sum, point) => sum + point.expense, 0);
  assert.equal(Number(trendsIncome.toFixed(2)), 0);
  assert.equal(Number(trendsExpense.toFixed(2)), 100);
});

test("resolveDashboardDateRange keeps previous month aligned for month-anchored ranges", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fullMonth = deps.resolveDashboardDateRange({
    from: new Date("2026-02-01T00:00:00.000Z"),
    to: new Date("2026-02-28T00:00:00.000Z")
  });
  assert.equal(fullMonth.previousFrom, "2026-01-01");
  assert.equal(fullMonth.previousTo, "2026-01-31");

  const monthToDate = deps.resolveDashboardDateRange({
    from: new Date("2026-02-01T00:00:00.000Z"),
    to: new Date("2026-02-10T00:00:00.000Z")
  });
  assert.equal(monthToDate.previousFrom, "2026-01-01");
  assert.equal(monthToDate.previousTo, "2026-01-10");
});
