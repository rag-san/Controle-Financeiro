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
  importsRepo: typeof import("@/lib/server/imports.repo").importsRepo;
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  syncLedgerFromImportBatch: typeof import("@/lib/server/ledger-sync.service").syncLedgerFromImportBatch;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, normalizeModule, usersModule, accountsModule, importsModule, transactionsModule, ledgerRepoModule, ledgerSyncModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/imports.repo"),
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
        importsRepo: importsModule.importsRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        ledgerRepo: ledgerRepoModule.ledgerRepo,
        syncLedgerFromImportBatch: ledgerSyncModule.syncLedgerFromImportBatch
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
      `Database unavailable for ledger sync tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

async function createFixtureUser(prefix: string): Promise<{
  userId: string;
  checkingAccountId: string;
  creditAccountId: string;
}> {
  const deps = await loadDeps();
  const user = await deps.usersRepo.create({
    email: `${prefix}.${Date.now()}@example.com`,
    name: `${prefix}-user`,
    password: null
  });
  assert.ok(user);

  const checking = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-checking`,
    type: "checking",
    institution: "Inter"
  });
  assert.ok(checking);

  const credit = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-credit`,
    type: "credit",
    institution: "Inter",
    parentAccountId: checking.id
  });
  assert.ok(credit);

  return {
    userId: user.id,
    checkingAccountId: checking.id,
    creditAccountId: credit.id
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

test("syncLedgerFromImportBatch keeps card flow coherent and idempotent", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("ledger-sync");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const batch = await deps.importsRepo.createBatch({
    userId: fixture.userId,
    sourceType: "csv",
    fileName: "batch-sync.csv",
    mapping: null
  });
  assert.ok(batch);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.creditAccountId,
    categoryId: null,
    importBatchId: batch.id,
    date: new Date("2026-02-10T12:00:00.000Z"),
    description: "Compra cartao mercado",
    normalizedDescription: deps.normalizeDescription("Compra cartao mercado"),
    amount: -120,
    type: "expense",
    status: "posted"
  });

  const transferPair = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.checkingAccountId,
    toAccountId: fixture.creditAccountId,
    date: new Date("2026-02-15T12:00:00.000Z"),
    description: "Pagamento Fatura - Gabriel",
    normalizedDescription: deps.normalizeDescription("Pagamento Fatura - Gabriel"),
    amount: 120,
    status: "posted",
    importBatchId: batch.id,
    raw: {
      transferDetectedFromCardPayment: true
    }
  });
  assert.equal(transferPair.created, true);

  const firstSync = await deps.syncLedgerFromImportBatch({
    userId: fixture.userId,
    importBatchId: batch.id,
    fileName: batch.fileName
  });

  assert.equal(firstSync.processed, 3);
  assert.equal(firstSync.created, 2);
  assert.equal(firstSync.skipped, 1);

  const summaryAfterFirstSync = await deps.ledgerRepo.getDashboardSummary({ userId: fixture.userId });
  assert.equal(summaryAfterFirstSync.totalSpending, 120);

  const totalCash = summaryAfterFirstSync.cashBalance.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(Number(totalCash.toFixed(2)), -120);

  const cardDebt = summaryAfterFirstSync.cardDebt.find(
    (card) => card.creditCardAccountId === fixture.creditAccountId
  );
  assert.equal(cardDebt?.amount ?? 0, 0);

  const secondSync = await deps.syncLedgerFromImportBatch({
    userId: fixture.userId,
    importBatchId: batch.id,
    fileName: batch.fileName
  });

  assert.equal(secondSync.processed, 3);
  assert.equal(secondSync.created, 0);
  assert.ok(secondSync.deduped >= 2);
});
