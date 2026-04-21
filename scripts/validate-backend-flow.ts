import { dateKeyToNoonDate, toDateKey } from "../lib/finance/date-keys";
import { db } from "../lib/db";
import { totalsFromGroupedTypes } from "../lib/finance/official-metrics";
import { normalizeDescription } from "../lib/normalize";
import { accountsRepo } from "../lib/server/accounts.repo";
import { categoriesRepo } from "../lib/server/categories.repo";
import { resolveDashboardDateRange } from "../lib/server/dashboard-analytics.service";
import { getDashboardSummaryView } from "../lib/server/dashboard-summary.service";
import { syncLedgerForLegacyTransactions } from "../lib/server/ledger-sync.service";
import { transactionsRepo } from "../lib/server/transactions.repo";
import { createTransactionForUser, listTransactionsForUser } from "../lib/server/transactions.service";
import type { TransactionDTO } from "../lib/types";
import { buildReportsModel } from "../src/features/reports/buildReportsModel";
import { buildPeriodComparison } from "../src/features/reports/utils/period";
import { seedTestData } from "./seed";

type TransactionsListResponse = ReturnType<typeof listTransactionsForUser>;
type TransactionItem = Awaited<TransactionsListResponse>["items"][number];

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

async function tableColumns(table: string): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ?`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

async function tableIndexes(table: string): Promise<string[]> {
  const result = await db.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ?`,
    [table]
  );
  return result.rows.map((row) => row.indexname);
}

function toDate(value: string | Date): Date {
  const dateKey = toDateKey(value);
  const normalized = dateKey ? dateKeyToNoonDate(dateKey) : null;
  if (normalized) return normalized;
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
  const totals = totalsFromGroupedTypes(
    items.map((item) => ({ type: item.type, amount: item.amount }))
  );
  return {
    income: totals.income,
    expense: totals.expense,
    net: totals.net
  };
}

async function run(): Promise<void> {
  const seeded = await seedTestData();
  console.log(`[validate] seed user: ${seeded.email} (${seeded.userId})`);
  console.log(
    `[validate] seeded transactions=${seeded.createdCount}, income=${seeded.totals.income}, expense=${seeded.totals.expense}, net=${seeded.totals.net}`
  );
  const seededTransactions = await transactionsRepo.listAll({
    userId: seeded.userId
  });
  await syncLedgerForLegacyTransactions({
    userId: seeded.userId,
    transactionIds: seededTransactions.map((transaction) => transaction.id)
  });
  console.log(`[validate] ledger mirror synced for seeded rows: ${seededTransactions.length}`);

  const accountColumns = await tableColumns("accounts");
  assert(accountColumns.includes("parent_account_id"), "Schema sem coluna accounts.parent_account_id.");
  const transactionColumns = await tableColumns("transactions");
  assert(transactionColumns.includes("transfer_group_id"), "Schema sem coluna transactions.transfer_group_id.");
  assert(transactionColumns.includes("transfer_peer_tx_id"), "Schema sem coluna transactions.transfer_peer_tx_id.");
  const importEventsColumns = await tableColumns("import_events");
  assert(importEventsColumns.includes("source_type"), "Schema sem coluna import_events.source_type.");
  const snapshotColumns = await tableColumns("official_metric_snapshots");
  assert(snapshotColumns.includes("metric_key"), "Schema sem coluna official_metric_snapshots.metric_key.");

  const accountIndexes = await tableIndexes("accounts");
  assert(accountIndexes.includes("idx_accounts_user_parent"), "Indice idx_accounts_user_parent ausente.");
  const transactionIndexes = await tableIndexes("transactions");
  assert(
    transactionIndexes.includes("idx_transactions_user_transfer_group"),
    "Indice idx_transactions_user_transfer_group ausente."
  );
  assert(
    transactionIndexes.includes("idx_transactions_account_transfer_group"),
    "Indice idx_transactions_account_transfer_group ausente."
  );
  const snapshotIndexes = await tableIndexes("official_metric_snapshots");
  assert(
    snapshotIndexes.includes("idx_metric_snapshots_user_metric_period"),
    "Indice idx_metric_snapshots_user_metric_period ausente."
  );
  const importEventsIndexes = await tableIndexes("import_events");
  assert(importEventsIndexes.includes("idx_import_events_user_created"), "Indice idx_import_events_user_created ausente.");

  const allBefore = await listTransactionsForUser(seeded.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 200,
    includeMeta: true,
    hideCardPaymentMirrorInflow: false
  });
  const excludedBefore = await listTransactionsForUser(seeded.userId, {
    period: "all",
    excluded: "true",
    sort: "date_desc",
    page: 1,
    pageSize: 200,
    includeMeta: false,
    hideCardPaymentMirrorInflow: false
  });
  const expectedIncludedVisibleCount = await transactionsRepo.count({
    userId: seeded.userId,
    excluded: false,
    hideCardPaymentMirrorInflow: false
  });
  const expectedExcludedVisibleCount = await transactionsRepo.count({
    userId: seeded.userId,
    excluded: true,
    hideCardPaymentMirrorInflow: false
  });

  assert(
    allBefore.pagination.totalCount === expectedIncludedVisibleCount,
    `Quantidade inicial de transações incluídas divergente. esperado=${expectedIncludedVisibleCount} atual=${allBefore.pagination.totalCount}`
  );
  assert(
    excludedBefore.pagination.totalCount === expectedExcludedVisibleCount,
    `Quantidade inicial de transações excluídas divergente. esperado=${expectedExcludedVisibleCount} atual=${excludedBefore.pagination.totalCount}`
  );
  assert(Number.isFinite(allBefore.summary.income), "Resumo inicial de receitas inválido.");
  assert(Number.isFinite(allBefore.summary.expense), "Resumo inicial de despesas inválido.");
  assert(
    approxEqual(allBefore.summary.balance, round2(allBefore.summary.income - allBefore.summary.expense)),
    `Resumo inicial inconsistente. income=${allBefore.summary.income} expense=${allBefore.summary.expense} balance=${allBefore.summary.balance}`
  );

  const created = await createTransactionForUser(seeded.userId, {
    accountId: seeded.accounts.checkingId,
    categoryId: null,
    date: "2026-02-21",
    description: "Compra teste validação",
    amount: -73.4,
    status: "posted"
  });

  assert(Boolean(created?.id), "Falha ao criar transação no fluxo de validação.");

  const allAfter = await listTransactionsForUser(seeded.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 250,
    includeMeta: true,
    hideCardPaymentMirrorInflow: false
  });

  const summaryBeforeTransfer = { ...allAfter.summary };
  const transferCountBefore = allAfter.items.filter((item) => item.type === "transfer").length;

  assert(
    allAfter.pagination.totalCount === allBefore.pagination.totalCount + 1,
    "Total de transações após create não corresponde ao esperado."
  );

  const createdTransfer = await transactionsRepo.createTransferPair({
    userId: seeded.userId,
    fromAccountId: seeded.accounts.checkingId,
    toAccountId: seeded.accounts.creditId,
    date: new Date("2026-02-22T12:00:00.000Z"),
    description: "Pagamento fatura cartao QA",
    normalizedDescription: normalizeDescription("Pagamento fatura cartao QA"),
    amount: 250,
    raw: {
      transferDetectedFromCardPayment: true
    },
    status: "posted"
  });

  assert(createdTransfer.created, "Falha ao criar transferencia de validacao.");
  const createdTransferIds = [createdTransfer.outTxId, createdTransfer.inTxId].filter(
    (value): value is string => Boolean(value)
  );
  await syncLedgerForLegacyTransactions({
    userId: seeded.userId,
    transactionIds: createdTransferIds
  });

  const allAfterTransfer = await listTransactionsForUser(seeded.userId, {
    period: "all",
    sort: "date_desc",
    page: 1,
    pageSize: 300,
    includeMeta: true,
    hideCardPaymentMirrorInflow: false
  });
  const excludedAfterTransfer = await listTransactionsForUser(seeded.userId, {
    period: "all",
    excluded: "true",
    sort: "date_desc",
    page: 1,
    pageSize: 300,
    includeMeta: false,
    hideCardPaymentMirrorInflow: false
  });

  assert(
    allAfterTransfer.pagination.totalCount === allAfter.pagination.totalCount + 2,
    "Total de transações após transferencia não corresponde ao esperado."
  );
  assert(
    approxEqual(allAfterTransfer.summary.income, summaryBeforeTransfer.income),
    "Transferencia alterou indevidamente o total de receitas."
  );
  assert(
    approxEqual(allAfterTransfer.summary.expense, summaryBeforeTransfer.expense),
    "Transferencia alterou indevidamente o total de despesas."
  );
  assert(
    approxEqual(allAfterTransfer.summary.balance, summaryBeforeTransfer.balance),
    "Transferencia alterou indevidamente o saldo (income-expense)."
  );

  const transferRows = allAfterTransfer.items.filter((item) => item.type === "transfer");
  assert(transferRows.length === transferCountBefore + 2, "Quantidade de pernas de transferencia divergente.");
  assert(transferRows.every((item) => item.categoryId === null), "Transferencia nao deve possuir categoria.");

  const createdTransferRows = transferRows.filter((item) => item.description === "Pagamento fatura cartao QA");
  const transferOut = createdTransferRows.find((item) => item.accountId === seeded.accounts.checkingId && item.amount < 0);
  const transferIn = createdTransferRows.find((item) => item.accountId === seeded.accounts.creditId && item.amount > 0);
  assert(Boolean(transferOut), "Perna de saida da transferencia nao encontrada.");
  assert(Boolean(transferIn), "Perna de entrada da transferencia nao encontrada.");

  const accountBalances = await accountsRepo.listByUserWithBalance(seeded.userId);
  const manualBalanceByAccount = new Map<string, number>();
  const allRowsForBalance = [...allAfterTransfer.items, ...excludedAfterTransfer.items];
  for (const item of allRowsForBalance) {
    manualBalanceByAccount.set(item.accountId, round2((manualBalanceByAccount.get(item.accountId) ?? 0) + item.amount));
  }
  for (const account of accountBalances) {
    const rawExpectedBalance = manualBalanceByAccount.get(account.id) ?? 0;
    const expectedBalance =
      account.type === "credit" ? Math.min(0, rawExpectedBalance) : rawExpectedBalance;
    assert(
      approxEqual(account.currentBalance ?? 0, expectedBalance),
      `Saldo da conta ${account.name} divergente. esperado=${expectedBalance} atual=${account.currentBalance ?? 0}`
    );
  }

  const now = new Date("2026-02-21T12:00:00.000Z");
  const earliestDate = allAfterTransfer.items.reduce<Date | undefined>((earliest, item) => {
    const parsed = toDate(item.date);
    if (!Number.isFinite(parsed.getTime())) return earliest;
    if (!earliest) return parsed;
    return parsed.getTime() < earliest.getTime() ? parsed : earliest;
  }, undefined);

  const period = buildPeriodComparison("3M", { now, earliestDate });
  const categories = await categoriesRepo.listByUser(seeded.userId);
  const model = buildReportsModel({
    transactions: normalizeTransactionsForReports(allAfterTransfer.items),
    categories,
    period
  });

  const currentItems = allAfterTransfer.items.filter((item) => {
    const ts = toDate(item.date).getTime();
    return ts >= period.current.start.getTime() && ts <= period.current.end.getTime();
  });
  const manualCurrent = sumByType(currentItems);

  assert(approxEqual(model.currentTotals.income, manualCurrent.income), "Receita atual no model diverge do cálculo manual.");
  assert(approxEqual(model.currentTotals.expense, manualCurrent.expense), "Despesa atual no model diverge do cálculo manual.");
  assert(approxEqual(model.currentTotals.net, manualCurrent.net), "Saldo atual no model diverge do cálculo manual.");
  const currentCategorySum = round2(model.categorySpending.reduce((sum, item) => sum + item.value, 0));
  assert(
    approxEqual(currentCategorySum, model.currentTotals.expense),
    `Soma de categorias diverge do total de despesas. categorias=${currentCategorySum} total=${model.currentTotals.expense}`
  );
  assert(
    approxEqual(model.sankey.totalIncome, model.currentTotals.income),
    `Sankey (receitas) diverge do total do período. sankey=${model.sankey.totalIncome} total=${model.currentTotals.income}`
  );
  assert(
    approxEqual(model.sankey.totalExpense, model.currentTotals.expense),
    `Sankey (despesas) diverge do total do período. sankey=${model.sankey.totalExpense} total=${model.currentTotals.expense}`
  );
  const timeSeriesIncomeSum = round2(model.timeSeries.reduce((sum, item) => sum + item.income, 0));
  const timeSeriesExpenseSum = round2(model.timeSeries.reduce((sum, item) => sum + item.expense, 0));
  assert(
    approxEqual(timeSeriesIncomeSum, model.currentTotals.income),
    `Serie temporal (receitas) diverge do total do período. serie=${timeSeriesIncomeSum} total=${model.currentTotals.income}`
  );
  assert(
    approxEqual(timeSeriesExpenseSum, model.currentTotals.expense),
    `Serie temporal (despesas) diverge do total do período. serie=${timeSeriesExpenseSum} total=${model.currentTotals.expense}`
  );

  const dashboardRange = resolveDashboardDateRange({
    from: period.current.start,
    to: period.current.end
  });
  const dashboardSummary = await getDashboardSummaryView({
    userId: seeded.userId,
    range: dashboardRange
  });
  const dashboardIncome = dashboardSummary.totalIncome;
  const dashboardExpense = dashboardSummary.totalExpense;
  const dashboardNet = dashboardSummary.net;
  assert(
    Number.isFinite(dashboardIncome) && Number.isFinite(dashboardExpense) && Number.isFinite(dashboardNet),
    "Dashboard summary retornou totais inválidos."
  );
  assert(
    approxEqual(dashboardNet, round2(dashboardIncome - dashboardExpense)),
    `Dashboard summary inconsistente. income=${dashboardIncome} expense=${dashboardExpense} net=${dashboardNet}`
  );
  assert(model.timeSeries.length > 0, "Série temporal de relatórios vazia.");
  assert(model.categorySpending.length > 0, "Agregação de categorias vazia.");
  assert(model.topMerchants.length > 0, "Agregação de estabelecimentos vazia.");
  assert(model.sankey.nodes.length > 0 && model.sankey.links.length > 0, "Modelo Sankey vazio.");

  const recurringNames = model.recurringDetected.map((item) => item.merchantLabel.toLowerCase());
  const hasNetflixRecurring = recurringNames.some((name) => name.includes("netflix"));
  assert(hasNetflixRecurring, "Detecção de recorrência não identificou Netflix do seed.");

  console.log("[validate] transactions.list + summary: OK");
  console.log("[validate] transactions.create: OK");
  console.log("[validate] transfer pair + account balances reconciliation: OK");
  console.log("[validate] reports aggregates + sankey + recurring: OK");
  console.log("[validate] consistency checks (categorias/serie/sankey/dashboard): OK");
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
