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
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  categoriesRepo: typeof import("@/lib/server/categories.repo").categoriesRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  listTransactionsForUser: typeof import("@/lib/server/transactions.service").listTransactionsForUser;
  createTransactionForUser: typeof import("@/lib/server/transactions.service").createTransactionForUser;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, normalizeModule, accountsModule, categoriesModule, transactionsModule, usersModule, transactionsServiceModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/normalize"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/categories.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/transactions.service")
        ]);

      return {
        db,
        initDbOnce,
        normalizeDescription: normalizeModule.normalizeDescription,
        accountsRepo: accountsModule.accountsRepo,
        categoriesRepo: categoriesModule.categoriesRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        usersRepo: usersModule.usersRepo,
        listTransactionsForUser: transactionsServiceModule.listTransactionsForUser,
        createTransactionForUser: transactionsServiceModule.createTransactionForUser
      };
    })();
  }

  return depsPromise;
}

async function createFixtureUser(prefix: string): Promise<{
  userId: string;
  primaryAccountId: string;
  secondaryAccountId: string;
}> {
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
      `Database unavailable for transactions service tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

test("listTransactionsForUser applies excluded/search/type filters and sorting", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("tx-service");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const groceries = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Mercado-${Date.now()}`,
    color: "#22c55e"
  });
  const housing = await deps.categoriesRepo.create({
    userId: fixture.userId,
    name: `Moradia-${Date.now()}`,
    color: "#3b82f6"
  });
  assert.ok(groceries);
  assert.ok(housing);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: null,
    date: new Date("2026-02-10T12:00:00.000Z"),
    description: "Salario principal",
    normalizedDescription: deps.normalizeDescription("Salario principal"),
    amount: 3000,
    type: "income",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: groceries.id,
    date: new Date("2026-02-11T12:00:00.000Z"),
    description: "Mercado Extra",
    normalizedDescription: deps.normalizeDescription("Mercado Extra"),
    amount: -200,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: housing.id,
    date: new Date("2026-02-12T12:00:00.000Z"),
    description: "Aluguel QA",
    normalizedDescription: deps.normalizeDescription("Aluguel QA"),
    amount: -1200,
    type: "expense",
    excluded: false,
    status: "posted"
  });
  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.primaryAccountId,
    categoryId: housing.id,
    date: new Date("2026-02-13T12:00:00.000Z"),
    description: "Taxa Excluida",
    normalizedDescription: deps.normalizeDescription("Taxa Excluida"),
    amount: -50,
    type: "expense",
    excluded: true,
    status: "posted"
  });

  const transferPair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.primaryAccountId,
    toAccountId: fixture.secondaryAccountId,
    date: new Date("2026-02-14T12:00:00.000Z"),
    description: "Transferencia interna",
    normalizedDescription: deps.normalizeDescription("Transferencia interna"),
    amount: 500,
    status: "posted"
  });
  assert.equal(transferPair.created, true);

  const all = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: true
  });

  assert.equal(all.pagination.totalCount, 5);
  assert.equal(all.summary.income, 3000);
  assert.equal(all.summary.expense, 1400);
  assert.equal(all.summary.balance, 1600);
  assert.ok((all.meta?.accounts?.length ?? 0) >= 2);
  assert.ok((all.meta?.categories?.length ?? 0) >= 2);

  const includedOnly = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    excluded: "false",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(includedOnly.pagination.totalCount, 5);
  assert.equal(includedOnly.summary.income, 3000);
  assert.equal(includedOnly.summary.expense, 1400);
  assert.equal(includedOnly.summary.balance, 1600);

  const excludedOnly = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    excluded: "true",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(excludedOnly.pagination.totalCount, 1);
  assert.equal(excludedOnly.summary.income, 0);
  assert.equal(excludedOnly.summary.expense, 50);
  assert.equal(excludedOnly.summary.balance, -50);

  const bySearch = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    q: "mercado",
    excluded: "false",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(bySearch.items.length, 1);
  assert.equal(bySearch.items[0]?.description, "Mercado Extra");

  const transfersOnly = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    type: "transfer",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(transfersOnly.pagination.totalCount, 2);
  assert.equal(transfersOnly.summary.income, 0);
  assert.equal(transfersOnly.summary.expense, 0);
  assert.equal(transfersOnly.summary.balance, 0);

  const amountSorted = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    excluded: "false",
    sort: "amount_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(amountSorted.items[0]?.description, "Salario principal");
});

test("listTransactionsForUser returns stable empty state", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("tx-empty");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const response = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: true
  });

  assert.deepEqual(response.items, []);
  assert.equal(response.summary.income, 0);
  assert.equal(response.summary.expense, 0);
  assert.equal(response.summary.balance, 0);
  assert.equal(response.pagination.totalCount, 0);
  assert.equal(response.pagination.totalPages, 1);
  assert.equal(response.pagination.hasPreviousPage, false);
  assert.equal(response.pagination.hasNextPage, false);
  assert.ok((response.meta?.accounts?.length ?? 0) >= 2);
});

test("listTransactionsForUser hides mirrored credit inflow from card payment transfers by default", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("tx-card-payment-mirror");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const creditAccount = await deps.accountsRepo.create({
    userId: fixture.userId,
    name: `Cartao QA ${Date.now()}`,
    type: "credit",
    institution: "QA",
    parentAccountId: fixture.primaryAccountId
  });
  assert.ok(creditAccount);

  const createdPair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.primaryAccountId,
    toAccountId: creditAccount.id,
    date: new Date("2026-02-15T12:00:00.000Z"),
    description: "Pagamento Fatura - QA",
    normalizedDescription: deps.normalizeDescription("Pagamento Fatura - QA"),
    amount: 676.27,
    status: "posted",
    raw: {
      transferDetectedFromCardPayment: true
    }
  });
  assert.equal(createdPair.created, true);

  const defaultResponse = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false
  });
  assert.equal(defaultResponse.pagination.totalCount, 1);
  assert.equal(defaultResponse.items[0]?.direction, "out");
  assert.equal(defaultResponse.summary.income, 0);
  assert.equal(defaultResponse.summary.expense, 0);
  assert.equal(defaultResponse.summary.balance, 0);

  const withMirrorVisible = await deps.listTransactionsForUser(fixture.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 50,
    includeMeta: false,
    hideCardPaymentMirrorInflow: false
  });
  assert.equal(withMirrorVisible.pagination.totalCount, 2);
  assert.equal(withMirrorVisible.items.some((item) => item.direction === "in"), true);
});

test("createTransactionForUser rejects manual transactions on credit accounts", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("tx-credit-block");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const creditAccount = await deps.accountsRepo.create({
    userId: fixture.userId,
    name: `Cartao QA ${Date.now()}`,
    type: "credit",
    institution: "QA"
  });
  assert.ok(creditAccount);

  await assert.rejects(
    deps.createTransactionForUser(fixture.userId, {
      accountId: creditAccount.id,
      categoryId: null,
      date: "2026-02-20",
      description: "Compra manual no cartao",
      amount: "-150.00",
      type: "expense",
      status: "posted"
    }),
    /CREDIT_ACCOUNT_MANUAL_NOT_ALLOWED/
  );
});
