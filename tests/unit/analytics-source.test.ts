import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:55432/finance_test";

process.env.DATABASE_URL = testDatabaseUrl;
process.env.POSTGRES_URL = process.env.POSTGRES_URL?.trim() || testDatabaseUrl;

type LoadedDeps = {
  initDbOnce: typeof import("@/lib/db").initDbOnce;
  db: typeof import("@/lib/db").db;
  buildFingerprint: typeof import("@/lib/ledger/normalization").buildFingerprint;
  normalizeDescription: typeof import("@/lib/normalize").normalizeDescription;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  hasLedgerEntriesInScope: typeof import("@/lib/server/analytics-source").hasLedgerEntriesInScope;
  resolveAnalyticsSource: typeof import("@/lib/server/analytics-source").resolveAnalyticsSource;
  shouldUseLedgerForAnalytics: typeof import("@/lib/server/analytics-source").shouldUseLedgerForAnalytics;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, ledgerNormalizationModule, normalizeModule, usersModule, accountsModule, ledgerModule, transactionsModule, analyticsSourceModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/ledger/normalization"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/ledger.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/lib/server/analytics-source")
        ]);

      return {
        initDbOnce,
        db,
        buildFingerprint: ledgerNormalizationModule.buildFingerprint,
        normalizeDescription: normalizeModule.normalizeDescription,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        ledgerRepo: ledgerModule.ledgerRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        hasLedgerEntriesInScope: analyticsSourceModule.hasLedgerEntriesInScope,
        resolveAnalyticsSource: analyticsSourceModule.resolveAnalyticsSource,
        shouldUseLedgerForAnalytics: analyticsSourceModule.shouldUseLedgerForAnalytics
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
      `Database unavailable for analytics source tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

async function createFixtureUser(prefix: string): Promise<{
  userId: string;
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
    checkingAccountId: account.id
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
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

test("hasLedgerEntriesInScope respects transaction and account-type filters", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("analytics-source-filters");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 120,
    type: "expense",
    direction: "OUT",
    description: "Despesa analytics source",
    accountId: fixture.checkingAccountId
  });

  assert.equal(
    await deps.hasLedgerEntriesInScope({
      userId: fixture.userId,
      transactionTypes: ["income"]
    }),
    false
  );
  assert.equal(
    await deps.hasLedgerEntriesInScope({
      userId: fixture.userId,
      transactionTypes: ["expense"]
    }),
    true
  );
  assert.equal(
    await deps.hasLedgerEntriesInScope({
      userId: fixture.userId,
      accountTypes: ["credit"]
    }),
    false
  );
  assert.equal(
    await deps.hasLedgerEntriesInScope({
      userId: fixture.userId,
      accountTypes: ["checking"]
    }),
    true
  );
});

test("shouldUseLedgerForAnalytics maps ledger credit-card flows to expense and transfer slices", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("analytics-source-credit");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const card = await deps.ledgerRepo.createCreditCardAccount({
    userId: fixture.userId,
    name: `Cartao analytics source-${Date.now()}`,
    defaultPaymentAccountId: fixture.checkingAccountId
  });
  assert.ok(card);

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 3),
    amount: 300,
    type: "cc_purchase",
    direction: "OUT",
    description: "Compra cartao analytics source",
    creditCardAccountId: card.id
  });
  await insertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 4),
    amount: 300,
    type: "cc_payment",
    direction: "OUT",
    description: "Pagamento fatura analytics source",
    accountId: fixture.checkingAccountId,
    creditCardAccountId: card.id
  });

  assert.equal(
    await deps.shouldUseLedgerForAnalytics({
      userId: fixture.userId,
      transactionTypes: ["expense"],
      accountTypes: ["credit"]
    }),
    true
  );
  assert.equal(
    await deps.shouldUseLedgerForAnalytics({
      userId: fixture.userId,
      transactionTypes: ["transfer"],
      accountTypes: ["checking"]
    }),
    true
  );
});

test("resolveAnalyticsSource stays on legacy while mirrored coverage is incomplete", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("analytics-source-legacy");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.checkingAccountId,
    date: utcDate(year, monthIndex, 5),
    description: "Despesa legado sem espelho analytics source",
    normalizedDescription: deps.normalizeDescription("Despesa legado sem espelho analytics source"),
    amount: -80,
    type: "expense",
    status: "posted"
  });

  const resolution = await deps.resolveAnalyticsSource({
    userId: fixture.userId,
    transactionTypes: ["expense"]
  });

  assert.deepEqual(resolution, {
    source: "legacy",
    reason: "unmirrored_legacy_transactions",
    hasUnmirroredLegacyTransactions: true,
    hasLedgerEntriesInScope: false
  });
});
