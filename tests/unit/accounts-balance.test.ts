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
  transactionsRepo: typeof import("@/lib/server/transactions.repo").transactionsRepo;
  importsRepo: typeof import("@/lib/server/imports.repo").importsRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, normalizeModule, usersModule, accountsModule, transactionsModule, importsModule, ledgerModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/transactions.repo"),
          import("@/lib/server/imports.repo"),
          import("@/lib/server/ledger.repo")
        ]);

      return {
        db,
        initDbOnce,
        normalizeDescription: normalizeModule.normalizeDescription,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        transactionsRepo: transactionsModule.transactionsRepo,
        importsRepo: importsModule.importsRepo,
        ledgerRepo: ledgerModule.ledgerRepo
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
    t.skip(`Database unavailable for account balance tests: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function createFixture(prefix: string): Promise<{
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
    name: `${prefix}-conta`,
    type: "checking",
    institution: "QA"
  });
  assert.ok(checking);

  const credit = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-cartao`,
    type: "credit",
    institution: "QA",
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

async function mirrorLegacyCreditAccountInLedger(input: {
  userId: string;
  creditAccountId: string;
  checkingAccountId: string;
  name: string;
}): Promise<void> {
  const deps = await loadDeps();
  const now = new Date().toISOString();

  await deps.db
    .prepare(
      `INSERT INTO credit_card_accounts (
         id, user_id, institution_id, name, currency, closing_day, due_day, default_payment_account_id, created_at, updated_at
       ) VALUES (?, ?, NULL, ?, 'BRL', NULL, NULL, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`
    )
    .run(input.creditAccountId, input.userId, input.name, input.checkingAccountId, now, now);
}

function findBalance(
  accounts: Awaited<ReturnType<LoadedDeps["accountsRepo"]["listByUserWithBalance"]>>,
  accountId: string
): number {
  const account = accounts.find((item) => item.id === accountId);
  assert.ok(account);
  return account.currentBalance;
}

test("legacy balances do not turn credit-card payments into positive card assets", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("accounts-legacy-card");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const payment = await deps.transactionsRepo.createTransferPair({
    userId: fixture.userId,
    fromAccountId: fixture.checkingAccountId,
    toAccountId: fixture.creditAccountId,
    date: new Date("2026-04-07T12:00:00.000Z"),
    description: "Pagamento Fatura - QA",
    normalizedDescription: deps.normalizeDescription("Pagamento Fatura - QA"),
    amount: 2280.95,
    status: "posted",
    raw: {
      transferDetectedFromCardPayment: true
    }
  });
  assert.equal(payment.created, true);

  let balances = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  assert.equal(findBalance(balances, fixture.checkingAccountId), -2280.95);
  assert.equal(findBalance(balances, fixture.creditAccountId), 0);

  await deps.transactionsRepo.create({
    userId: fixture.userId,
    accountId: fixture.creditAccountId,
    date: new Date("2026-04-08T12:00:00.000Z"),
    description: "Compra cartao QA",
    normalizedDescription: deps.normalizeDescription("Compra cartao QA"),
    amount: -2500,
    type: "expense",
    status: "posted"
  });

  balances = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  assert.equal(findBalance(balances, fixture.checkingAccountId), -2280.95);
  assert.equal(findBalance(balances, fixture.creditAccountId), -219.05);
});

test("ledger balances clamp overpaid credit cards at zero and preserve real card debt", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("accounts-ledger-card");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  await mirrorLegacyCreditAccountInLedger({
    userId: fixture.userId,
    creditAccountId: fixture.creditAccountId,
    checkingAccountId: fixture.checkingAccountId,
    name: "Cartao ledger QA"
  });

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: new Date("2026-04-07T12:00:00.000Z"),
    amount: 2280.95,
    direction: "OUT",
    type: "cc_payment",
    descriptionNormalized: deps.normalizeDescription("Pagamento Fatura - QA"),
    accountId: fixture.checkingAccountId,
    creditCardAccountId: fixture.creditAccountId,
    fingerprint: `accounts-ledger-card-payment-${Date.now()}`
  });

  let balances = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  assert.equal(findBalance(balances, fixture.checkingAccountId), -2280.95);
  assert.equal(findBalance(balances, fixture.creditAccountId), 0);

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: new Date("2026-04-08T12:00:00.000Z"),
    amount: 2500,
    direction: "OUT",
    type: "cc_purchase",
    descriptionNormalized: deps.normalizeDescription("Compra cartao QA"),
    creditCardAccountId: fixture.creditAccountId,
    fingerprint: `accounts-ledger-card-purchase-${Date.now()}`
  });

  balances = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  assert.equal(findBalance(balances, fixture.checkingAccountId), -2280.95);
  assert.equal(findBalance(balances, fixture.creditAccountId), -219.05);
});

test("accounts expose latest confirmed statement balance separately from calculated balance", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixture("accounts-confirmed-balance");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const oldBatch = await deps.importsRepo.createBatch({
    userId: fixture.userId,
    sourceType: "pdf",
    fileName: "old-statement.pdf",
    mapping: null
  });
  const newBatch = await deps.importsRepo.createBatch({
    userId: fixture.userId,
    sourceType: "pdf",
    fileName: "new-statement.pdf",
    mapping: null
  });
  assert.ok(oldBatch);
  assert.ok(newBatch);

  await deps.importsRepo.upsertAccountBalanceSnapshots({
    userId: fixture.userId,
    batchId: oldBatch.id,
    sourceType: "pdf",
    fileName: oldBatch.fileName,
    snapshots: [
      {
        accountId: fixture.checkingAccountId,
        balanceDate: new Date("2026-03-31T12:00:00.000Z"),
        balance: 100,
        openingBalance: 0,
        computedClosingBalance: 100,
        rowCount: 2,
        balanceAnchorCount: 2
      }
    ]
  });

  await deps.importsRepo.upsertAccountBalanceSnapshots({
    userId: fixture.userId,
    batchId: newBatch.id,
    sourceType: "pdf",
    fileName: newBatch.fileName,
    snapshots: [
      {
        accountId: fixture.checkingAccountId,
        balanceDate: new Date("2026-04-30T12:00:00.000Z"),
        balance: 250.5,
        openingBalance: 100,
        computedClosingBalance: 250.5,
        rowCount: 4,
        balanceAnchorCount: 4
      }
    ]
  });

  const accounts = await deps.accountsRepo.listByUserWithBalance(fixture.userId);
  const checking = accounts.find((account) => account.id === fixture.checkingAccountId);

  assert.ok(checking);
  assert.equal(checking.currentBalance, 0);
  assert.equal(checking.confirmedBalance?.amount, 250.5);
  assert.equal(checking.confirmedBalance?.fileName, "new-statement.pdf");
  assert.equal(checking.confirmedBalance?.difference, -250.5);
  assert.equal(checking.confirmedBalance?.balanceAnchorCount, 4);
});
