import { categoriesRepo } from "../lib/server/categories.repo";
import { createTransactionForUser, listTransactionsForUser } from "../lib/server/transactions.service";
import type { TransactionDTO } from "../lib/types";
import { buildReportsModel } from "../src/features/reports/buildReportsModel";
import { buildPeriodComparison } from "../src/features/reports/utils/period";
import { seedTestData } from "./seed";

type TransactionsListResponse = ReturnType<typeof listTransactionsForUser>;
type TransactionItem = TransactionsListResponse["items"][number];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function approxEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeTransactionsForReports(items: TransactionItem[]): TransactionDTO[] {
  return items.map((item) => ({
    id: item.id,
    accountId: item.accountId,
    categoryId: item.categoryId ?? null,
    date: toDate(item.date).toISOString(),
    description: item.description,
    amount: item.amount,
    type: item.type,
    status: item.status,
    account: {
      id: item.account.id,
      name: item.account.name,
      type: item.account.type,
      institution: item.account.institution,
      currency: item.account.currency
    },
    category: item.category
      ? {
          id: item.category.id,
          name: item.category.name,
          color: item.category.color,
          icon: item.category.icon,
          parentId: item.category.parentId
        }
      : null
  }));
}

function sumByType(items: TransactionItem[]): { income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;

  for (const item of items) {
    const amount = Math.abs(item.amount);
    if (!Number.isFinite(amount)) continue;
    if (item.type === "income") {
      income = round2(income + amount);
    } else {
      expense = round2(expense + amount);
    }
  }

  return { income, expense, net: round2(income - expense) };
}

async function run(): Promise<void> {
  const seeded = seedTestData();
  console.log(`[validate] seed user: ${seeded.email} (${seeded.userId})`);
  console.log(
    `[validate] seeded transactions=${seeded.createdCount}, income=${seeded.totals.income}, expense=${seeded.totals.expense}, net=${seeded.totals.net}`
  );

  const allBefore = listTransactionsForUser(seeded.userId, {
    period: "all",
    page: 1,
    pageSize: 200,
    includeMeta: true
  });

  assert(allBefore.items.length === seeded.createdCount, "Quantidade inicial de transações diverge do seed.");
  assert(
    approxEqual(allBefore.summary.income, seeded.totals.income),
    `Resumo de receitas divergente. esperado=${seeded.totals.income} atual=${allBefore.summary.income}`
  );
  assert(
    approxEqual(allBefore.summary.expense, seeded.totals.expense),
    `Resumo de despesas divergente. esperado=${seeded.totals.expense} atual=${allBefore.summary.expense}`
  );

  const created = createTransactionForUser(seeded.userId, {
    accountId: seeded.accounts.checkingId,
    categoryId: null,
    date: "2026-02-21",
    description: "Compra teste validação",
    amount: -73.4,
    status: "posted"
  });

  assert(Boolean(created?.id), "Falha ao criar transação no fluxo de validação.");

  const allAfter = listTransactionsForUser(seeded.userId, {
    period: "all",
    page: 1,
    pageSize: 250,
    includeMeta: true
  });

  assert(
    allAfter.pagination.totalCount === seeded.createdCount + 1,
    "Total de transações após create não corresponde ao esperado."
  );

  const now = new Date("2026-02-21T12:00:00.000Z");
  const earliestDate = allAfter.items.reduce<Date | undefined>((earliest, item) => {
    const parsed = toDate(item.date);
    if (!Number.isFinite(parsed.getTime())) return earliest;
    if (!earliest) return parsed;
    return parsed.getTime() < earliest.getTime() ? parsed : earliest;
  }, undefined);

  const period = buildPeriodComparison("3M", { now, earliestDate });
  const categories = categoriesRepo.listByUser(seeded.userId);
  const model = buildReportsModel({
    transactions: normalizeTransactionsForReports(allAfter.items),
    categories,
    period
  });

  const currentItems = allAfter.items.filter((item) => {
    const ts = toDate(item.date).getTime();
    return ts >= period.current.start.getTime() && ts <= period.current.end.getTime();
  });
  const manualCurrent = sumByType(currentItems);

  assert(approxEqual(model.currentTotals.income, manualCurrent.income), "Receita atual no model diverge do cálculo manual.");
  assert(approxEqual(model.currentTotals.expense, manualCurrent.expense), "Despesa atual no model diverge do cálculo manual.");
  assert(approxEqual(model.currentTotals.net, manualCurrent.net), "Saldo atual no model diverge do cálculo manual.");
  assert(model.timeSeries.length > 0, "Série temporal de relatórios vazia.");
  assert(model.categorySpending.length > 0, "Agregação de categorias vazia.");
  assert(model.topMerchants.length > 0, "Agregação de estabelecimentos vazia.");
  assert(model.sankey.nodes.length > 0 && model.sankey.links.length > 0, "Modelo Sankey vazio.");

  const recurringNames = model.recurringDetected.map((item) => item.merchantLabel.toLowerCase());
  const hasNetflixRecurring = recurringNames.some((name) => name.includes("netflix"));
  assert(hasNetflixRecurring, "Detecção de recorrência não identificou Netflix do seed.");

  console.log("[validate] transactions.list + summary: OK");
  console.log("[validate] transactions.create: OK");
  console.log("[validate] reports aggregates + sankey + recurring: OK");
  console.log(
    `[validate] current period totals => income=${model.currentTotals.income} expense=${model.currentTotals.expense} net=${model.currentTotals.net}`
  );
  console.log("PASS");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha inesperada";
  console.error(`[validate] FAIL: ${message}`);
  process.exitCode = 1;
});
