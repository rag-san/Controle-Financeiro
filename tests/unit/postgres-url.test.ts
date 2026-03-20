import test from "node:test";
import assert from "node:assert/strict";
import { normalizePostgresConnectionString } from "@/lib/db/postgres-url";

test("normaliza sslmode=require para verify-full", () => {
  const normalized = normalizePostgresConnectionString(
    "postgresql://user:pass@db.example.com:5432/app?sslmode=require"
  );

  assert.equal(normalized, "postgresql://user:pass@db.example.com:5432/app?sslmode=verify-full");
});

test("preserva sslmode=require quando uselibpqcompat=true", () => {
  const normalized = normalizePostgresConnectionString(
    "postgresql://user:pass@db.example.com:5432/app?uselibpqcompat=true&sslmode=require"
  );

  assert.equal(
    normalized,
    "postgresql://user:pass@db.example.com:5432/app?uselibpqcompat=true&sslmode=require"
  );
});

test("mantem URLs sem sslmode legado", () => {
  const rawUrl = "postgresql://user:pass@db.example.com:5432/app?sslmode=verify-full&application_name=finance";

  assert.equal(normalizePostgresConnectionString(rawUrl), rawUrl);
});

test("retorna a entrada original quando a URL e invalida", () => {
  const rawUrl = "not-a-postgres-url";

  assert.equal(normalizePostgresConnectionString(rawUrl), rawUrl);
});
