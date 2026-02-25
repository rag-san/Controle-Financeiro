import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { initDbOnce } from "../lib/db";
import { commitImportForUser } from "../lib/server/imports-commit.service";
import { accountsRepo } from "../lib/server/accounts.repo";
import { usersRepo } from "../lib/server/users.repo";
import { restoreDefaultCategoriesForUser } from "../lib/server/default-categories.service";

type BenchmarkScenario = {
  name: string;
  rows: number;
};

type BenchmarkResult = {
  scenario: string;
  requestedRows: number;
  imported: number;
  skipped: number;
  duplicates: number;
  invalidRows: number;
  transfersCreated: number;
  elapsedMs: number;
  rowsPerSecond: number;
};

const SCENARIOS: BenchmarkScenario[] = [
  { name: "import-1k", rows: 1_000 },
  { name: "import-3k", rows: 3_000 },
  { name: "import-5k", rows: 5_000 }
];

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatDate(baseDate: Date, dayOffset: number): string {
  const date = new Date(baseDate.getTime());
  date.setDate(baseDate.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function generateRows(count: number, scenarioTag: string): Array<{
  date: string;
  description: string;
  amount: number;
  accountHint: string;
  externalId: string;
}> {
  const rows: Array<{
    date: string;
    description: string;
    amount: number;
    accountHint: string;
    externalId: string;
  }> = [];

  const baseDate = new Date("2026-01-01T12:00:00.000Z");

  for (let index = 0; index < count; index += 1) {
    const dayOffset = index % 90;
    const date = formatDate(baseDate, dayOffset);
    const amountBase = ((index % 40) + 1) * 3.17;
    const isIncome = index % 11 === 0;
    const amount = Number((isIncome ? amountBase : -amountBase).toFixed(2));
    const descriptionPrefix =
      index % 13 === 0 ? "PIX TRANSFERENCIA CLIENTE" : index % 7 === 0 ? "SUPERMERCADO BAIRRO" : "COMPRA CARTAO";

    rows.push({
      date,
      description: `${descriptionPrefix} ${scenarioTag} ${index + 1}`,
      amount,
      accountHint: "Conta Corrente Benchmark",
      externalId: `bench-${scenarioTag}-${count}-${index + 1}`
    });
  }

  return rows;
}

async function ensureBenchmarkContext(): Promise<{
  userId: string;
  defaultAccountId: string;
}> {
  await initDbOnce();

  const token = randomUUID().slice(0, 8);
  const email = `benchmark.import.${token}@example.com`;

  const user = await usersRepo.create({
    email,
    name: "Benchmark Import",
    password: null
  });

  if (!user) {
    throw new Error("Falha ao criar usuario para benchmark.");
  }

  await restoreDefaultCategoriesForUser(user.id);

  const checking = await accountsRepo.create({
    userId: user.id,
    name: "Conta Corrente Benchmark",
    type: "checking",
    institution: "Benchmark Bank",
    currency: "BRL"
  });

  if (!checking) {
    throw new Error("Falha ao criar conta benchmark.");
  }

  return {
    userId: user.id,
    defaultAccountId: checking.id
  };
}

async function runScenario(input: {
  userId: string;
  defaultAccountId: string;
  scenario: BenchmarkScenario;
}): Promise<BenchmarkResult> {
  const rows = generateRows(input.scenario.rows, input.scenario.name);
  const startedAt = performance.now();

  const result = await commitImportForUser(input.userId, {
    sourceType: "csv",
    fileName: `${input.scenario.name}.csv`,
    defaultAccountId: input.defaultAccountId,
    applyRules: false,
    applyLocalAi: false,
    rows
  });

  const elapsedMs = performance.now() - startedAt;
  const rowsPerSecond = elapsedMs > 0 ? (input.scenario.rows / elapsedMs) * 1000 : 0;

  return {
    scenario: input.scenario.name,
    requestedRows: input.scenario.rows,
    imported: result.totalImported,
    skipped: result.totalSkipped,
    duplicates: result.duplicates ?? 0,
    invalidRows: result.invalidRows ?? 0,
    transfersCreated: result.totalTransfersCreated ?? 0,
    elapsedMs: round(elapsedMs, 1),
    rowsPerSecond: round(rowsPerSecond, 2)
  };
}

async function run(): Promise<void> {
  const context = await ensureBenchmarkContext();
  const results: BenchmarkResult[] = [];

  for (const scenario of SCENARIOS) {
    const result = await runScenario({
      userId: context.userId,
      defaultAccountId: context.defaultAccountId,
      scenario
    });
    results.push(result);
    console.log(
      `[benchmark:import] ${result.scenario} rows=${result.requestedRows} elapsed_ms=${result.elapsedMs} rps=${result.rowsPerSecond}`
    );
  }

  console.log("[benchmark:import] summary");
  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      rows: result.requestedRows,
      imported: result.imported,
      skipped: result.skipped,
      duplicates: result.duplicates,
      invalidRows: result.invalidRows,
      transfers: result.transfersCreated,
      elapsedMs: result.elapsedMs,
      rowsPerSecond: result.rowsPerSecond
    }))
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[benchmark:import] FAIL: ${message}`);
  process.exitCode = 1;
});
