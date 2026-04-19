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
  ledgerRepo: typeof import("@/lib/server/ledger.repo").ledgerRepo;
  netWorthRepo: typeof import("@/lib/server/net-worth.repo").netWorthRepo;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, authModule, routeModule, ledgerNormalizationModule, normalizeModule, usersModule, accountsModule, ledgerModule, netWorthModule] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/auth"),
          import("@/app/api/metrics/official/route"),
          import("@/lib/ledger/normalization"),
          import("@/lib/normalize"),
          import("@/lib/server/users.repo"),
          import("@/lib/server/accounts.repo"),
          import("@/lib/server/ledger.repo"),
          import("@/lib/server/net-worth.repo")
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
        ledgerRepo: ledgerModule.ledgerRepo,
        netWorthRepo: netWorthModule.netWorthRepo
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
      `Database unavailable for dashboard net worth fallback tests: ${error instanceof Error ? error.message : "unknown"}`
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

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
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

test("dashboard falls back to account balances for current net worth when manual snapshots do not exist", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("dashboard-net-worth-fallback");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 1500,
    direction: "IN",
    type: "income",
    descriptionNormalized: deps.normalizeDescription("Salario dashboard net worth fallback"),
    accountId: fixture.checkingAccountId,
    fingerprint: deps.buildFingerprint({
      postedAt: utcDate(year, monthIndex, 2),
      amountCents: 150000,
      type: "income",
      direction: "IN",
      descriptionNormalized: deps.normalizeDescription("Salario dashboard net worth fallback"),
      accountId: fixture.checkingAccountId,
      creditCardAccountId: null
    })
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest("/api/metrics/official?view=dashboard", fixture, deps.AUTH_SECRET)
  );
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.view, "dashboard");
  assert.equal(payload.cards.netWorth, 1500);
  assert.equal(payload.netWorthDelta, 0);
  assert.ok(payload.netWorthSeries.length >= 1);
  assert.equal(payload.netWorthSeries[payload.netWorthSeries.length - 1]?.value ?? 0, 1500);
});

test("dashboard does not leak current account balances into a historical month without snapshots", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("dashboard-net-worth-history");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const previousMonthDate = new Date(Date.UTC(year, monthIndex, 0, 12, 0, 0, 0));
  const previousMonth = `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(year, monthIndex, 2),
    amount: 1500,
    direction: "IN",
    type: "income",
    descriptionNormalized: deps.normalizeDescription("Salario dashboard net worth history"),
    accountId: fixture.checkingAccountId,
    fingerprint: deps.buildFingerprint({
      postedAt: utcDate(year, monthIndex, 2),
      amountCents: 150000,
      type: "income",
      direction: "IN",
      descriptionNormalized: deps.normalizeDescription("Salario dashboard net worth history"),
      accountId: fixture.checkingAccountId,
      creditCardAccountId: null
    })
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=dashboard&month=${previousMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.view, "dashboard");
  assert.equal(payload.referenceMonth, previousMonth);
  assert.equal(payload.cards.netWorth, 0);
  assert.deepEqual(payload.netWorthSeries, []);
  assert.equal(payload.netWorthDelta, 0);
});

test("dashboard historical month uses real patrimony from imported movements when snapshots do not exist", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("dashboard-net-worth-history-real");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const previousMonthDate = new Date(Date.UTC(year, monthIndex, 0, 12, 0, 0, 0));
  const previousMonthYear = previousMonthDate.getUTCFullYear();
  const previousMonthIndex = previousMonthDate.getUTCMonth();
  const previousMonth = `${previousMonthYear}-${String(previousMonthIndex + 1).padStart(2, "0")}`;

  await deps.ledgerRepo.upsertLedgerEntry({
    userId: fixture.userId,
    postedAt: utcDate(previousMonthYear, previousMonthIndex, 10),
    amount: 1500,
    direction: "IN",
    type: "income",
    descriptionNormalized: deps.normalizeDescription("Salario dashboard net worth history real"),
    accountId: fixture.checkingAccountId,
    fingerprint: deps.buildFingerprint({
      postedAt: utcDate(previousMonthYear, previousMonthIndex, 10),
      amountCents: 150000,
      type: "income",
      direction: "IN",
      descriptionNormalized: deps.normalizeDescription("Salario dashboard net worth history real"),
      accountId: fixture.checkingAccountId,
      creditCardAccountId: null
    })
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=dashboard&month=${previousMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.view, "dashboard");
  assert.equal(payload.referenceMonth, previousMonth);
  assert.equal(payload.cards.netWorth, 1500);
  assert.ok(payload.netWorthSeries.length > 0);
  assert.equal(payload.netWorthSeries[payload.netWorthSeries.length - 1]?.value ?? 0, 1500);
  assert.equal(payload.netWorthDelta, 0);
});

test("dashboard historical month uses the latest manual net-worth snapshot up to the requested month", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("dashboard-net-worth-snapshot");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const previousMonthDate = new Date(Date.UTC(year, monthIndex, 0, 12, 0, 0, 0));
  const previousMonth = `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  await deps.netWorthRepo.create({
    userId: fixture.userId,
    type: "asset",
    name: "Patrimonio anterior",
    value: 800,
    date: previousMonthDate
  });
  await deps.netWorthRepo.create({
    userId: fixture.userId,
    type: "asset",
    name: "Patrimonio atual",
    value: 1500,
    date: utcDate(year, monthIndex, 5)
  });

  const response = await deps.GET(
    await buildAuthenticatedRequest(
      `/api/metrics/official?view=dashboard&month=${previousMonth}`,
      fixture,
      deps.AUTH_SECRET
    )
  );
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.view, "dashboard");
  assert.equal(payload.referenceMonth, previousMonth);
  assert.equal(payload.cards.netWorth, 800);
  assert.equal(payload.netWorthSeries.length, 1);
  assert.equal(payload.netWorthSeries[0]?.value ?? 0, 800);
  assert.equal(payload.netWorthDelta, 0);
});
