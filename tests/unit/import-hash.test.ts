import test from "node:test";
import assert from "node:assert/strict";
import { createImportedHash } from "@/lib/hash";

test("createImportedHash prioritizes externalId when available", () => {
  const base = {
    userId: "user_1",
    sourceType: "csv" as const,
    accountId: "acc_1",
    date: new Date("2026-01-10T00:00:00.000Z"),
    amount: -100.25,
    normalizedDescription: "COMPRA TESTE"
  };

  const hashA = createImportedHash({
    ...base,
    externalId: " tx-123 "
  });
  const hashB = createImportedHash({
    ...base,
    amount: -999.99,
    normalizedDescription: "OUTRA DESCRICAO",
    externalId: "TX-123"
  });

  assert.equal(hashA, hashB);
});

test("createImportedHash keeps legacy fingerprint when externalId is absent", () => {
  const hashA = createImportedHash({
    userId: "user_1",
    sourceType: "csv",
    accountId: "acc_1",
    date: new Date("2026-01-10T00:00:00.000Z"),
    amount: -100.25,
    normalizedDescription: "COMPRA TESTE"
  });
  const hashB = createImportedHash({
    userId: "user_1",
    sourceType: "csv",
    accountId: "acc_1",
    date: new Date("2026-01-10T00:00:00.000Z"),
    amount: -100.25,
    normalizedDescription: "COMPRA TESTE"
  });

  assert.equal(hashA, hashB);
});
