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
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  categoriesRepo: typeof import("@/lib/server/categories.repo").categoriesRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  syncLedgerForLegacyTransactions: typeof import("@/lib/server/ledger-sync.service").syncLedgerForLegacyTransactions;
  deleteLedgerForLegacyTransactions: typeof import("@/lib/server/ledger-sync.service").deleteLedgerForLegacyTransactions;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [
        { db, initDbOnce },
        normalizeModule,
        usersModule,
        accountsModule,
        categoriesModule,
        transactionsModule,
        ledgerRepoModule,
        ledgerSyncModule
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/normalize"),
        import("@/lib/server/users.repo"),
        import("@/lib/server/accounts.repo"),
        import("@/lib/server/categories.repo"),
        import("@/lib/server/transactions.repo"),
        import("@/lib/server/ledger.repo"),
        import("@/lib/server/ledger-sync.service")
      ]);

      return {
        db,
        initDbOnce,
        normalizeDescription: normalizeModule.normalizeDescription,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        categoriesRepo: categoriesModule.categoriesRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        ledgerRepo: ledgerRepoModule.ledgerRepo,
        syncLedgerForLegacyTransactions: ledgerSyncModule.syncLedgerForLegacyTransactions,
        deleteLedgerForLegacyTransactions: ledgerSyncModule.deleteLedgerForLegacyTransactions
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
      `Database unavailable for manual ledger sync tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

async function createFixture(prefix: string): Promise<{
  userId: string;
  accountAId: string;
  accountBId: string;
  categoryAId: string;
  categoryBId: string;
}> {
  const deps = await loadDeps();
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const user = await deps.usersRepo.create({
    email: `${prefix}.${unique}@example.com`,
    name: `${prefix}-user`,
    password: null
  });
  assert.ok(user);

  const accountA = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-checking-a`,
    type: "checking",
    institution: "Inter"
  });
  const accountB = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-checking-b`,
    type: "checking",
    institution: "Nubank"
  });
  assert.ok(accountA);
  assert.ok(accountB);

  const categoryA = await deps.categoriesRepo.create({
    userId: user.id,
    name: `${prefix}-categoria-a`,
    color: "#0ea5e9"
  });
  const categoryB = await deps.categoriesRepo.create({
    userId: user.id,
    name: `${prefix}-categoria-b`,
    color: "#22c55e"
  });
  assert.ok(categoryA);
  assert.ok(categoryB);

  return {
    userId: user.id,
    accountAId: accountA.id,
    accountBId: accountB.id,
    categoryAId: categoryA.id,
    categoryBId: categoryB.id
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

test("syncLedgerForLegacyTransactions mantém ledger alinhado em update de categoria e delete", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("ledger-manual-sync");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const created = await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.accountAId,
    categoryId: fixture.categoryAId,
    date: new Date("2026-02-11T12:00:00.000Z"),
    description: "Mercado semanal",
    normalizedDescription: deps.normalizeDescription("Mercado semanal"),
    amount: -150,
    type: "expense",
    status: "posted"
  });
  assert.ok(created);

  const syncCreated = await deps.syncLedgerForLegacyTransactions({
    userId: fixture.userId,
    transactionIds: [created.id]
  });
  assert.equal(syncCreated.created, 1);

  const externalRef = `LEGACY_TX:${created.id}`;
  const firstEntry = await deps.ledgerRepo.findLedgerEntryByExternalRef(fixture.userId, externalRef);
  assert.ok(firstEntry);
  assert.equal(firstEntry.type, "expense");
  assert.equal(firstEntry.categoryId, fixture.categoryAId);
  assert.equal(firstEntry.amountCents, 15000);

  const updated = await deps.transactionsRepo.update({
    id: created.id,
    userId: fixture.userId,
    categoryId: fixture.categoryBId
  });
  assert.ok(updated);

  const syncUpdated = await deps.syncLedgerForLegacyTransactions({
    userId: fixture.userId,
    transactionIds: [created.id]
  });
  assert.ok(syncUpdated.created >= 1 || syncUpdated.deduped >= 1);

  const updatedEntry = await deps.ledgerRepo.findLedgerEntryByExternalRef(fixture.userId, externalRef);
  assert.ok(updatedEntry);
  assert.equal(updatedEntry.categoryId, fixture.categoryBId);

  const cascadeIds = await deps.transactionsRepo.resolveCascadeDeleteIdsForUser([created.id], fixture.userId);
  assert.equal(cascadeIds.length, 1);
  await deps.transactionsRepo.deleteManyByIdsForUser(cascadeIds, fixture.userId);
  const deleteResult = await deps.deleteLedgerForLegacyTransactions({
    userId: fixture.userId,
    transactionIds: cascadeIds
  });
  assert.equal(deleteResult.deleted, 1);

  const removedEntry = await deps.ledgerRepo.findLedgerEntryByExternalRef(fixture.userId, externalRef);
  assert.equal(removedEntry, null);
});

test("resolveCascadeDeleteIdsForUser inclui par de transferência e limpa ledger das duas pontas", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("ledger-cascade");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const pair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.accountAId,
    toAccountId: fixture.accountBId,
    date: new Date("2026-02-18T12:00:00.000Z"),
    description: "PIX entre contas",
    normalizedDescription: deps.normalizeDescription("PIX entre contas"),
    amount: 500,
    status: "posted",
    raw: {
      transferDetectedFromCardPayment: false
    }
  });
  assert.equal(pair.created, true);
  assert.ok(pair.outTxId);
  assert.ok(pair.inTxId);

  await deps.syncLedgerForLegacyTransactions({
    userId: fixture.userId,
    transactionIds: [pair.outTxId as string, pair.inTxId as string]
  });

  const cascadeIds = await deps.transactionsRepo.resolveCascadeDeleteIdsForUser(
    [pair.outTxId as string],
    fixture.userId
  );
  assert.deepEqual(
    [...cascadeIds].sort(),
    [pair.outTxId as string, pair.inTxId as string].sort()
  );

  await deps.transactionsRepo.deleteManyByIdsForUser(cascadeIds, fixture.userId);
  const ledgerDelete = await deps.deleteLedgerForLegacyTransactions({
    userId: fixture.userId,
    transactionIds: cascadeIds
  });
  assert.equal(ledgerDelete.deleted, 2);

  const outEntry = await deps.ledgerRepo.findLedgerEntryByExternalRef(
    fixture.userId,
    `LEGACY_TX:${pair.outTxId as string}`
  );
  const inEntry = await deps.ledgerRepo.findLedgerEntryByExternalRef(
    fixture.userId,
    `LEGACY_TX:${pair.inTxId as string}`
  );
  assert.equal(outEntry, null);
  assert.equal(inEntry, null);
});
