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
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
  accountsRepo: typeof import("@/lib/server/accounts.repo").accountsRepo;
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  importLedgerForUser: typeof import("@/lib/server/ledger.service").importLedgerForUser;
  runTransferMatcherForUser: typeof import("@/lib/server/ledger.service").runTransferMatcherForUser;
  getReconciliationInboxForUser: typeof import("@/lib/server/ledger.service").getReconciliationInboxForUser;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, usersModule, accountsModule, ledgerRepoModule, ledgerServiceModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/ledger.repo"),
          import("@/lib/server/ledger.service")
        ]);

      return {
        db,
        initDbOnce,
        usersRepo: usersModule.usersRepo,
        accountsRepo: accountsModule.accountsRepo,
        ledgerRepo: ledgerRepoModule.ledgerRepo,
        importLedgerForUser: ledgerServiceModule.importLedgerForUser,
        runTransferMatcherForUser: ledgerServiceModule.runTransferMatcherForUser,
        getReconciliationInboxForUser: ledgerServiceModule.getReconciliationInboxForUser
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
    t.skip(`Database unavailable for ledger tests: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function createFixtureUser(
  prefix: string
): Promise<{
  userId: string;
  interAccountId: string;
  nubankAccountId: string;
  cardId: string;
  interInstitutionId: string;
  nubankInstitutionId: string;
}> {
  const deps = await loadDeps();
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const user = await deps.usersRepo.create({
    email: `${prefix}.${unique}@example.com`,
    name: `${prefix}-ledger`,
    password: null
  });
  assert.ok(user);

  const interInstitution = await deps.ledgerRepo.findOrCreateInstitution({ name: "Inter" });
  const nubankInstitution = await deps.ledgerRepo.findOrCreateInstitution({ name: "Nubank" });

  const interAccount = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-inter`,
    type: "checking",
    institution: "Inter"
  });
  const nubankAccount = await deps.accountsRepo.create({
    userId: user.id,
    name: `${prefix}-nubank`,
    type: "checking",
    institution: "Nubank"
  });
  assert.ok(interAccount);
  assert.ok(nubankAccount);

  const card = await deps.ledgerRepo.createCreditCardAccount({
    userId: user.id,
    institutionId: interInstitution.id,
    name: `${prefix}-card`,
    closingDay: 10,
    dueDay: 15,
    defaultPaymentAccountId: interAccount.id
  });
  assert.ok(card);

  return {
    userId: user.id,
    interAccountId: interAccount.id,
    nubankAccountId: nubankAccount.id,
    cardId: card.id,
    interInstitutionId: interInstitution.id,
    nubankInstitutionId: nubankInstitution.id
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

test("dedup por fingerprint evita duplicação ao importar a mesma linha duas vezes", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("ledger-dedup");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const rows = [
    {
      postedAt: "2026-02-10T00:00:00.000Z",
      amount: -42.5,
      description: "Compra mercado QA",
      direction: "OUT" as const
    }
  ];

  const first = await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "dedup.csv",
    defaultAccountId: fixture.interAccountId,
    fileHash: "dedup-hash-001",
    rows
  });
  const second = await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "dedup.csv",
    defaultAccountId: fixture.interAccountId,
    fileHash: "dedup-hash-001",
    rows
  });

  assert.equal(first.imported, 1);
  assert.equal(second.duplicateImportSource, true);
  assert.equal(second.imported, 0);

  const countRow = (await deps.db
    .prepare("SELECT COUNT(*) AS count FROM ledger_entries WHERE user_id = ?")
    .get(fixture.userId)) as { count: number | string };
  assert.equal(Number(countRow.count), 1);
});

test("TransferMatcher pareia OUT/IN internos e não infla gasto/receita", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("ledger-transfer");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "baseline.csv",
    defaultAccountId: fixture.interAccountId,
    fileHash: "baseline-hash-001",
    rows: [
      {
        postedAt: "2026-02-01T00:00:00.000Z",
        amount: -100,
        description: "Mercado real",
        direction: "OUT"
      }
    ]
  });

  const baseline = await deps.ledgerRepo.getDashboardSummary({ userId: fixture.userId });
  assert.equal(baseline.totalSpending, 100);
  assert.equal(baseline.incomeTotal, 0);

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "transfer-out.csv",
    defaultAccountId: fixture.interAccountId,
    fileHash: "transfer-out-001",
    rows: [
      {
        postedAt: "2026-02-14T00:00:00.000Z",
        amount: -500,
        description: "PIX ENVIADO PARA NUBANK",
        direction: "OUT"
      }
    ]
  });

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.nubankInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "transfer-in.csv",
    defaultAccountId: fixture.nubankAccountId,
    fileHash: "transfer-in-001",
    rows: [
      {
        postedAt: "2026-02-14T00:00:00.000Z",
        amount: 500,
        description: "PIX RECEBIDO DE INTER",
        direction: "IN"
      }
    ]
  });

  const matcher = await deps.runTransferMatcherForUser({ userId: fixture.userId });
  assert.ok(matcher.matched >= 1);

  const after = await deps.ledgerRepo.getDashboardSummary({ userId: fixture.userId });
  assert.equal(after.totalSpending, 100);
  assert.equal(after.incomeTotal, 0);
});

test("cc_purchase não altera caixa e cc_payment reduz dívida", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("ledger-card");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "CC_STATEMENT",
    filename: "cc-purchase.csv",
    defaultCreditCardAccountId: fixture.cardId,
    fileHash: "cc-purchase-001",
    rows: [
      {
        postedAt: "2026-02-03T00:00:00.000Z",
        amount: -120,
        description: "COMPRA CARTAO FARMACIA",
        direction: "OUT"
      }
    ]
  });

  const afterPurchase = await deps.ledgerRepo.getDashboardSummary({ userId: fixture.userId });
  const cashAfterPurchase = Number(
    afterPurchase.cashBalance.reduce((sum, account) => sum + account.amount, 0).toFixed(2)
  );
  const debtAfterPurchase = Number(afterPurchase.cardDebt.reduce((sum, card) => sum + card.amount, 0).toFixed(2));

  assert.equal(cashAfterPurchase, 0);
  assert.equal(debtAfterPurchase, 120);

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "cc-payment.csv",
    defaultAccountId: fixture.interAccountId,
    fileHash: "cc-payment-001",
    rows: [
      {
        postedAt: "2026-02-12T00:00:00.000Z",
        amount: -120,
        description: "PAGAMENTO FATURA CARTAO INTER",
        direction: "OUT"
      }
    ]
  });

  const afterPayment = await deps.ledgerRepo.getDashboardSummary({ userId: fixture.userId });
  const cashAfterPayment = Number(
    afterPayment.cashBalance.reduce((sum, account) => sum + account.amount, 0).toFixed(2)
  );
  const debtAfterPayment = Number(afterPayment.cardDebt.reduce((sum, card) => sum + card.amount, 0).toFixed(2));

  assert.equal(cashAfterPayment, -120);
  assert.equal(debtAfterPayment, 0);
});

test("diferença por taxa (1000 vs 998.50) gera sugestão para revisão manual", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("ledger-fee");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.interInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "fee-out.csv",
    defaultAccountId: fixture.interAccountId,
    fileHash: "fee-out-001",
    rows: [
      {
        postedAt: "2026-02-20T00:00:00.000Z",
        amount: -1000,
        description: "TED ENVIADO",
        direction: "OUT"
      }
    ]
  });

  await deps.importLedgerForUser(fixture.userId, {
    institutionId: fixture.nubankInstitutionId,
    kind: "BANK_STATEMENT",
    filename: "fee-in.csv",
    defaultAccountId: fixture.nubankAccountId,
    fileHash: "fee-in-001",
    rows: [
      {
        postedAt: "2026-02-21T00:00:00.000Z",
        amount: 998.5,
        description: "TED RECEBIDO",
        direction: "IN"
      }
    ]
  });

  const matcher = await deps.runTransferMatcherForUser({ userId: fixture.userId });
  assert.ok(matcher.suggested >= 1);

  const inbox = await deps.getReconciliationInboxForUser(fixture.userId);
  assert.ok(inbox.transferSuggestions.length >= 1);
});
