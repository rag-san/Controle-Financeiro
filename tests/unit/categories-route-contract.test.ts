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
  POST: typeof import("@/app/api/categories/route").POST;
  usersRepo: typeof import("@/lib/server/users.repo").usersRepo;
};

let depsPromise: Promise<LoadedDeps> | null = null;

function loadDeps(): Promise<LoadedDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const [{ db, initDbOnce }, authModule, routeModule, usersModule] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/auth"),
        import("@/app/api/categories/route"),
        import("@/lib/server/users.repo")
      ]);

      return {
        initDbOnce,
        db,
        AUTH_SECRET: authModule.AUTH_SECRET,
        POST: routeModule.POST,
        usersRepo: usersModule.usersRepo
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
      `Database unavailable for categories route contract tests: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}

async function createFixtureUser(prefix: string): Promise<{
  userId: string;
  email: string;
  name: string;
}> {
  const deps = await loadDeps();
  const user = await deps.usersRepo.create({
    email: `${prefix}.${Date.now()}@example.com`,
    name: `${prefix}-user`,
    password: null
  });
  assert.ok(user);

  return {
    userId: user.id,
    email: user.email,
    name: user.name
  };
}

async function cleanupUser(userId: string): Promise<void> {
  const deps = await loadDeps();
  await deps.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

async function buildAuthenticatedJsonRequest(
  path: string,
  user: { userId: string; email: string; name: string },
  secret: string | undefined,
  payload: unknown
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
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

test("categories route rejects unsupported fields in create payload", async (t) => {
  const deps = await requireDeps(t);
  if (!deps) return;

  const fixture = await createFixtureUser("categories-route-contract");
  t.after(async () => {
    await cleanupUser(fixture.userId);
  });

  const response = await deps.POST(
    await buildAuthenticatedJsonRequest(
      "/api/categories",
      fixture,
      deps.AUTH_SECRET,
      {
        name: "Mercado contrato",
        color: "#22c55e",
        icon: "tag",
        parentId: null,
        budget: 500,
        type: "expense"
      }
    )
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.ok(payload?.error);
});
