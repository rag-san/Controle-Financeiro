import { eachMonthOfInterval, format } from "date-fns";
import { categoriesRepo } from "@/lib/server/categories.repo";
import {
  dashboardMetricsRepo,
  type DashboardDateRange,
  type DashboardMetricsFilters
} from "@/lib/server/dashboard-metrics.repo";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { buildReportsModel, buildReportsModelFromPrepared } from "@/src/features/reports/buildReportsModel";
import type {
  ReportPreparedTransaction,
  ReportsCashSummary,
  ReportsPeriodPreset
} from "@/src/features/reports/types";
import { buildPeriodComparison } from "@/src/features/reports/utils/period";
import {
  calculateTotals,
  formatRange,
  resolveCurrentRange,
  resolvePreviousRange,
  splitByRange,
  toComparisonMetric
} from "@/src/features/cashflow/utils/cashflow";
import { buildMonthlyExpensesStack } from "@/src/features/cashflow/utils/expensesStack";
import { buildMonthlyIncome } from "@/src/features/cashflow/utils/income";
import { buildMonthlyNetResult } from "@/src/features/cashflow/utils/netResult";
import type {
  CashflowPeriodKey,
  DateRange,
  ExpensesStackedChartData,
  IncomeRow,
  NetResultRow
} from "@/src/features/cashflow/types";
import { extractMerchantKey } from "@/src/features/insights/utils/merchant";

type LedgerAnalyticsEntry = Awaited<ReturnType<typeof ledgerRepo.listAnalyticsEntries>>[number];
type LegacyTransactionRow = Awaited<ReturnType<typeof transactionsRepo.listPaged>>[number];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toDashboardRange(current: DateRange, previous: DateRange): DashboardDateRange {
  return {
    fromDate: current.from,
    toDate: current.to,
    previousFromDate: previous.from,
    previousToDate: previous.to,
    from: current.from.toISOString(),
    to: current.to.toISOString(),
    previousFrom: previous.from.toISOString(),
    previousTo: previous.to.toISOString()
  };
}

function inRange(date: Date, range: DateRange): boolean {
  const time = date.getTime();
  return time >= range.from.getTime() && time <= range.to.getTime();
}

function resolveCashBalance(
  rows: Array<{
    accountId: string;
    amount: number;
  }>,
  accountId?: string
): number {
  const scopedRows = accountId ? rows.filter((row) => row.accountId === accountId) : rows;
  return round2(scopedRows.reduce((sum, row) => sum + row.amount, 0));
}

function toTransactionDTO(item: LegacyTransactionRow): TransactionDTO {
  return {
    id: item.id,
    accountId: item.accountId,
    categoryId: item.categoryId ?? null,
    importBatchId: item.importBatchId ?? null,
    date: item.date.toISOString(),
    description: item.description,
    amount: item.amount,
    type: item.type,
    direction: item.direction,
    excluded: item.excluded,
    isInternalTransfer: item.isInternalTransfer,
    status: item.status,
    transferGroupId: item.transferGroupId ?? null,
    transferPeerTxId: item.transferPeerTxId ?? null,
    transferFromAccountId: item.transferFromAccountId ?? null,
    transferToAccountId: item.transferToAccountId ?? null,
    raw: item.raw ?? null,
    account: {
      id: item.account.id,
      name: item.account.name,
      type: item.account.type,
      institution: item.account.institution ?? null,
      currency: item.account.currency,
      parentAccountId: item.account.parentAccountId ?? null
    },
    category: item.category
      ? {
          id: item.category.id,
          name: item.category.name,
          color: item.category.color,
          icon: item.category.icon ?? null,
          parentId: item.category.parentId ?? null
        }
      : null
  };
}

function buildReportsCashSummary(input: {
  inflow: number;
  outflow: number;
  net: number;
  previousInflow: number;
  previousOutflow: number;
  previousNet: number;
  cashBalance: number;
}): ReportsCashSummary {
  return {
    inflow: round2(input.inflow),
    outflow: round2(input.outflow),
    net: round2(input.net),
    previousInflow: round2(input.previousInflow),
    previousOutflow: round2(input.previousOutflow),
    previousNet: round2(input.previousNet),
    cashBalance: round2(input.cashBalance)
  };
}

function hasCashAccount(entry: LedgerAnalyticsEntry): boolean {
  return entry.account?.type === "checking" || entry.account?.type === "cash";
}

function resolveCashDeltaCents(entry: LedgerAnalyticsEntry): number {
  if (!hasCashAccount(entry)) return 0;

  if (entry.type === "income") return entry.amountCents;
  if (entry.type === "expense" || entry.type === "fee") return -entry.amountCents;
  if (entry.type === "transfer") {
    return entry.direction === "IN" ? entry.amountCents : entry.direction === "OUT" ? -entry.amountCents : 0;
  }
  if (entry.type === "cc_payment") {
    return entry.direction === "IN" ? entry.amountCents : entry.direction === "OUT" ? -entry.amountCents : 0;
  }
  if (entry.type === "refund") {
    return entry.direction === "IN" ? entry.amountCents : entry.direction === "OUT" ? -entry.amountCents : 0;
  }

  return 0;
}

function resolveCashCategoryName(entry: LedgerAnalyticsEntry): string {
  if (entry.category?.name?.trim()) return entry.category.name.trim();
  if (entry.type === "cc_payment") return "Pagamento de fatura";
  if (entry.type === "transfer") return "Transferências";
  if (entry.type === "fee") return "Tarifas";
  if (entry.type === "refund") return "Estornos";
  return "Sem categoria";
}

type PreparedCashEntry = {
  id: string;
  postedAt: Date;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
  categoryName: string;
};

function toPreparedCashEntry(entry: LedgerAnalyticsEntry): PreparedCashEntry | null {
  const netCents = resolveCashDeltaCents(entry);
  if (netCents === 0) return null;

  return {
    id: entry.id,
    postedAt: entry.postedAt,
    inflowCents: Math.max(netCents, 0),
    outflowCents: Math.max(-netCents, 0),
    netCents,
    categoryName: resolveCashCategoryName(entry)
  };
}

function buildMonthKeys(start: Date, end: Date): string[] {
  return eachMonthOfInterval({ start, end }).map((value) => format(value, "yyyy-MM"));
}

function buildMonthlyCashNetChart(input: {
  currentEntries: PreparedCashEntry[];
  currentRange: DateRange;
  previousEntries: PreparedCashEntry[];
  previousRange: DateRange;
}): NetResultRow[] {
  const currentMonthKeys = buildMonthKeys(input.currentRange.from, input.currentRange.to);
  const previousMonthKeys = buildMonthKeys(input.previousRange.from, input.previousRange.to);
  const currentByMonth = new Map<string, number>(currentMonthKeys.map((month) => [month, 0]));
  const previousByMonth = new Map<string, number>(previousMonthKeys.map((month) => [month, 0]));

  for (const entry of input.currentEntries) {
    const month = format(entry.postedAt, "yyyy-MM");
    if (!currentByMonth.has(month)) continue;
    currentByMonth.set(month, (currentByMonth.get(month) ?? 0) + entry.netCents);
  }

  for (const entry of input.previousEntries) {
    const month = format(entry.postedAt, "yyyy-MM");
    if (!previousByMonth.has(month)) continue;
    previousByMonth.set(month, (previousByMonth.get(month) ?? 0) + entry.netCents);
  }

  const previousByIndex = previousMonthKeys.map((month) => round2((previousByMonth.get(month) ?? 0) / 100));

  return currentMonthKeys.map((month, index) => ({
    month,
    net: round2((currentByMonth.get(month) ?? 0) / 100),
    previousNet: index < previousByIndex.length ? previousByIndex[index] : undefined
  }));
}

function buildMonthlyCashInflowChart(entries: PreparedCashEntry[], range: DateRange): IncomeRow[] {
  const monthKeys = buildMonthKeys(range.from, range.to);
  const inflowByMonth = new Map<string, number>(monthKeys.map((month) => [month, 0]));

  for (const entry of entries) {
    const month = format(entry.postedAt, "yyyy-MM");
    if (!inflowByMonth.has(month)) continue;
    inflowByMonth.set(month, (inflowByMonth.get(month) ?? 0) + entry.inflowCents);
  }

  return monthKeys.map((month) => ({
    month,
    income: round2((inflowByMonth.get(month) ?? 0) / 100)
  }));
}

function buildMonthlyCashOutflowStack(
  entries: PreparedCashEntry[],
  range: DateRange,
  topN = 8
): ExpensesStackedChartData {
  const monthKeys = buildMonthKeys(range.from, range.to);
  const monthCategoryMap = new Map<string, Map<string, number>>(monthKeys.map((month) => [month, new Map()]));
  const categoryTotals = new Map<string, number>();

  for (const entry of entries) {
    if (entry.outflowCents <= 0) continue;

    const month = format(entry.postedAt, "yyyy-MM");
    if (!monthCategoryMap.has(month)) continue;
    const category = entry.categoryName.trim() || "Sem categoria";
    const monthValues = monthCategoryMap.get(month);
    if (!monthValues) continue;

    monthValues.set(category, (monthValues.get(category) ?? 0) + entry.outflowCents);
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + entry.outflowCents);
  }

  const orderedCategories = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total }))
    .filter((item) => item.total > 0)
    .sort((left, right) => right.total - left.total);

  const topCategories = orderedCategories.slice(0, topN).map((item) => item.category);
  const hasOther = orderedCategories.length > topCategories.length;
  const categories = hasOther ? [...topCategories, "Outras categorias"] : topCategories;
  const legendCategories = hasOther
    ? [...topCategories.slice(0, 5), "Outras categorias"]
    : topCategories.slice(0, 5);

  return {
    rows: monthKeys.map((month) => {
      const row: Record<string, string | number> = { month, total: 0 };
      for (const category of categories) {
        row[category] = 0;
      }

      const monthValues = monthCategoryMap.get(month) ?? new Map<string, number>();
      let totalCents = 0;
      for (const [category, value] of monthValues.entries()) {
        totalCents += value;
        if (topCategories.includes(category)) {
          row[category] = round2(value / 100);
        } else if (hasOther) {
          row["Outras categorias"] = round2(Number(row["Outras categorias"] ?? 0) + value / 100);
        }
      }

      row.total = round2(totalCents / 100);
      return row as ExpensesStackedChartData["rows"][number];
    }),
    categories,
    legendCategories,
    topN
  };
}

function resolveReportCategory(entry: LedgerAnalyticsEntry, categoriesById: Map<string, CategoryDTO>) {
  const category = (entry.categoryId ? categoriesById.get(entry.categoryId) : null) ?? entry.category ?? null;
  const name = category?.name?.trim() || "Sem categoria";
  const parentId = category?.parentId ?? null;
  const parentName = parentId ? categoriesById.get(parentId)?.name?.trim() ?? null : null;

  return {
    id: category?.id ?? entry.categoryId ?? null,
    name,
    color: category?.color ?? "#94a3b8",
    icon: category?.icon ?? null,
    parentId,
    parentName
  };
}

function buildLedgerMerchantKey(entry: LedgerAnalyticsEntry, accountName: string): string {
  const normalized = entry.merchantNormalized?.trim().toLowerCase();
  if (normalized) return normalized;

  return extractMerchantKey({
    id: entry.id,
    accountId: entry.accountId ?? entry.creditCardAccountId ?? "",
    date: entry.postedAt.toISOString(),
    description: entry.descriptionNormalized,
    amount: entry.amount,
    type: entry.type === "income" ? "income" : entry.type === "transfer" ? "transfer" : "expense",
    status: "posted",
    account: {
      id: entry.accountId ?? entry.creditCardAccountId ?? "",
      name: accountName,
      type: entry.account?.type ?? "credit",
      institution: entry.account?.institution ?? null,
      currency: entry.account?.currency ?? entry.creditCardAccount?.currency ?? "BRL",
      parentAccountId: entry.account?.parentAccountId ?? null
    },
    category: null
  });
}

function toPreparedReportTransaction(
  entry: LedgerAnalyticsEntry,
  categoriesById: Map<string, CategoryDTO>
): ReportPreparedTransaction {
  const category = resolveReportCategory(entry, categoriesById);
  const accountName =
    entry.account?.name?.trim() ||
    entry.creditCardAccount?.name?.trim() ||
    "Conta";

  let incomeCents = 0;
  let expenseCents = 0;
  let type: ReportPreparedTransaction["type"] = "transfer";

  if (entry.type === "income") {
    incomeCents = entry.amountCents;
    type = "income";
  } else if (entry.type === "expense" || entry.type === "cc_purchase" || entry.type === "fee") {
    expenseCents = entry.amountCents;
    type = "expense";
  } else if (entry.type === "refund") {
    expenseCents = -entry.amountCents;
    type = "expense";
  }

  return {
    id: entry.id,
    date: entry.postedAt,
    timestamp: entry.postedAt.getTime(),
    amount: round2(entry.amount),
    absAmount: round2(entry.amount),
    type,
    incomeCents,
    expenseCents,
    description: entry.descriptionNormalized,
    accountId: entry.accountId ?? entry.creditCardAccountId ?? "",
    accountName,
    categoryId: category.id,
    parentCategoryId: category.parentId,
    parentCategoryName: category.parentName,
    categoryName: category.name,
    categoryColor: category.color,
    categoryIcon: category.icon,
    merchantKey: buildLedgerMerchantKey(entry, accountName)
  };
}

async function buildLegacyReportsPayload(input: {
  userId: string;
  preset: ReportsPeriodPreset;
  accountId?: string;
  categoryId?: string;
}) {
  const earliestDate = (await transactionsRepo.oldestPostedAt(input.userId, { excluded: false })) ?? undefined;
  const period = buildPeriodComparison(input.preset, { now: new Date(), earliestDate });
  const start =
    period.current.start.getTime() <= period.previous.start.getTime() ? period.current.start : period.previous.start;
  const end = period.current.end.getTime() >= period.previous.end.getTime() ? period.current.end : period.previous.end;

  const rows = await transactionsRepo.listAll({
    userId: input.userId,
    dateFrom: start,
    dateTo: end,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  });
  const transactions = rows.map(toTransactionDTO);
  const categories = await categoriesRepo.listByUser(input.userId);
  const model = buildReportsModel({
    transactions,
    categories,
    period,
    accountId: input.accountId,
    categoryId: input.categoryId
  });
  const currentCash = await transactionsRepo.sumCashFlow({
    userId: input.userId,
    dateFrom: period.current.start,
    dateTo: period.current.end,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  });
  const previousCash = await transactionsRepo.sumCashFlow({
    userId: input.userId,
    dateFrom: period.previous.start,
    dateTo: period.previous.end,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  });
  const accountsWithBalance = await accountsRepo.listByUserWithBalance(input.userId);
  const filteredAccounts = input.accountId
    ? accountsWithBalance.filter((account) => account.id === input.accountId)
    : accountsWithBalance;
  const cashBalance = round2(
    filteredAccounts
      .filter((account) => account.type === "checking" || account.type === "cash")
      .reduce((sum, account) => sum + (account.currentBalance ?? 0), 0)
  );

  return {
    period,
    categories,
    accounts: await accountsRepo.listByUser(input.userId),
    model: {
      ...model,
      cashSummary: buildReportsCashSummary({
        inflow: currentCash.inflow,
        outflow: currentCash.outflow,
        net: currentCash.net,
        previousInflow: previousCash.inflow,
        previousOutflow: previousCash.outflow,
        previousNet: previousCash.net,
        cashBalance
      })
    }
  };
}

async function buildLedgerReportsPayload(input: {
  userId: string;
  preset: ReportsPeriodPreset;
  accountId?: string;
  categoryId?: string;
}) {
  const earliestDate =
    (await ledgerRepo.oldestVisiblePostedAt({
      userId: input.userId,
      accountId: input.accountId,
      categoryId: input.categoryId
    })) ??
    (await transactionsRepo.oldestPostedAt(input.userId, { excluded: false })) ??
    undefined;
  const period = buildPeriodComparison(input.preset, { now: new Date(), earliestDate });
  const mergedRange = {
    from:
      period.current.start.getTime() <= period.previous.start.getTime()
        ? period.current.start
        : period.previous.start,
    to:
      period.current.end.getTime() >= period.previous.end.getTime()
        ? period.current.end
        : period.previous.end
  };
  const categories = await categoriesRepo.listByUser(input.userId);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const entries = await ledgerRepo.listAnalyticsEntries({
    userId: input.userId,
    from: mergedRange.from,
    to: mergedRange.to,
    accountId: input.accountId,
    categoryId: input.categoryId
  });
  const preparedTransactions = entries.map((entry) => toPreparedReportTransaction(entry, categoriesById));
  const summary = await dashboardMetricsRepo.getSummary({
    userId: input.userId,
    range: toDashboardRange(
      { from: period.current.start, to: period.current.end },
      { from: period.previous.start, to: period.previous.end }
    ),
    filters: {
      accountId: input.accountId,
      categoryId: input.categoryId,
      excluded: false
    }
  });
  const balanceSnapshot = await ledgerRepo.getDashboardSummary({
    userId: input.userId,
    to: period.current.end
  });
  const cashBalance = resolveCashBalance(balanceSnapshot.cashBalance, input.accountId);

  return {
    period,
    categories,
    accounts: await accountsRepo.listByUser(input.userId),
    model: buildReportsModelFromPrepared({
      transactions: preparedTransactions,
      period,
      cashSummary: buildReportsCashSummary({
        inflow: summary.cashInflow,
        outflow: summary.cashOutflow,
        net: summary.cashNet,
        previousInflow: summary.previousPeriodComparison.previousCashInflow,
        previousOutflow: summary.previousPeriodComparison.previousCashOutflow,
        previousNet: summary.previousPeriodComparison.previousCashNet,
        cashBalance
      })
    })
  };
}

async function shouldUseLedgerAnalytics(input: {
  userId: string;
  from: Date;
  to: Date;
  accountId?: string;
  categoryId?: string;
}): Promise<boolean> {
  const entries = await ledgerRepo.listAnalyticsEntries({
    userId: input.userId,
    from: input.from,
    to: input.to,
    accountId: input.accountId,
    categoryId: input.categoryId
  });

  return entries.length > 0;
}

async function buildLegacyCashflowPayload(input: {
  userId: string;
  period: CashflowPeriodKey;
  accountId?: string;
}) {
  const referenceDate = (await transactionsRepo.latestPostedAt(input.userId, { excluded: false })) ?? new Date();
  const currentRange = resolveCurrentRange(input.period, referenceDate);
  const previousRange = resolvePreviousRange(currentRange);
  const mergedRange = {
    from: previousRange.from,
    to: currentRange.to
  };

  const rangeTransactions = (await transactionsRepo.listAll({
    userId: input.userId,
    dateFrom: mergedRange.from,
    dateTo: mergedRange.to,
    accountId: input.accountId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  })).map(toTransactionDTO);
  const currentTransactions = splitByRange(rangeTransactions, currentRange);
  const previousTransactions = splitByRange(rangeTransactions, previousRange);
  const currentCash = await transactionsRepo.sumCashFlow({
    userId: input.userId,
    dateFrom: currentRange.from,
    dateTo: currentRange.to,
    accountId: input.accountId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  });
  const previousCash = await transactionsRepo.sumCashFlow({
    userId: input.userId,
    dateFrom: previousRange.from,
    dateTo: previousRange.to,
    accountId: input.accountId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  });
  const accountsWithBalance = await accountsRepo.listByUserWithBalance(input.userId);
  const filteredAccounts = input.accountId
    ? accountsWithBalance.filter((account) => account.id === input.accountId)
    : accountsWithBalance;
  const cashBalance = round2(
    filteredAccounts
      .filter((account) => account.type === "checking" || account.type === "cash")
      .reduce((sum, account) => sum + (account.currentBalance ?? 0), 0)
  );
  const currentTotals = calculateTotals(currentTransactions);
  const previousTotals = calculateTotals(previousTransactions);

  return {
    currentRangeLabel: formatRange(currentRange),
    previousRangeLabel: formatRange(previousRange),
    cashBalance,
    netResult: toComparisonMetric(currentCash.net, previousCash.net),
    income: toComparisonMetric(currentCash.inflow, previousCash.inflow),
    expense: toComparisonMetric(currentCash.outflow, previousCash.outflow),
    netChart: buildMonthlyNetResult(currentTransactions, {
      start: currentRange.from,
      end: currentRange.to,
      previousTransactions,
      previousStart: previousRange.from,
      previousEnd: previousRange.to
    }),
    incomeChart: buildMonthlyIncome(currentTransactions, {
      start: currentRange.from,
      end: currentRange.to
    }),
    expensesChart: buildMonthlyExpensesStack(currentTransactions, { topN: 8 }),
    classifiedIncome: toComparisonMetric(currentTotals.income, previousTotals.income),
    classifiedExpense: toComparisonMetric(currentTotals.expense, previousTotals.expense)
  };
}

async function buildLedgerCashflowPayload(input: {
  userId: string;
  period: CashflowPeriodKey;
  accountId?: string;
}) {
  const referenceDate =
    (await ledgerRepo.latestVisiblePostedAt({
      userId: input.userId,
      accountId: input.accountId
    })) ??
    (await transactionsRepo.latestPostedAt(input.userId, { excluded: false })) ??
    new Date();
  const currentRange = resolveCurrentRange(input.period, referenceDate);
  const previousRange = resolvePreviousRange(currentRange);
  const mergedRange = {
    from: previousRange.from,
    to: currentRange.to
  };
  const summary = await dashboardMetricsRepo.getSummary({
    userId: input.userId,
    range: toDashboardRange(currentRange, previousRange),
    filters: input.accountId ? ({ accountId: input.accountId, excluded: false } satisfies DashboardMetricsFilters) : undefined
  });
  const balanceSnapshot = await ledgerRepo.getDashboardSummary({
    userId: input.userId,
    to: currentRange.to
  });
  const cashBalance = resolveCashBalance(balanceSnapshot.cashBalance, input.accountId);
  const entries = await ledgerRepo.listAnalyticsEntries({
    userId: input.userId,
    from: mergedRange.from,
    to: mergedRange.to,
    accountId: input.accountId
  });
  const preparedEntries = entries
    .map((entry) => toPreparedCashEntry(entry))
    .filter((entry): entry is PreparedCashEntry => entry !== null);
  const currentEntries = preparedEntries.filter((entry) => inRange(entry.postedAt, currentRange));
  const previousEntries = preparedEntries.filter((entry) => inRange(entry.postedAt, previousRange));

  return {
    currentRangeLabel: formatRange(currentRange),
    previousRangeLabel: formatRange(previousRange),
    cashBalance,
    netResult: toComparisonMetric(summary.cashNet, summary.previousPeriodComparison.previousCashNet),
    income: toComparisonMetric(summary.cashInflow, summary.previousPeriodComparison.previousCashInflow),
    expense: toComparisonMetric(summary.cashOutflow, summary.previousPeriodComparison.previousCashOutflow),
    netChart: buildMonthlyCashNetChart({
      currentEntries,
      currentRange,
      previousEntries,
      previousRange
    }),
    incomeChart: buildMonthlyCashInflowChart(currentEntries, currentRange),
    expensesChart: buildMonthlyCashOutflowStack(currentEntries, currentRange, 8),
    classifiedIncome: toComparisonMetric(summary.totalIncome, summary.previousPeriodComparison.previousIncome),
    classifiedExpense: toComparisonMetric(summary.totalExpense, summary.previousPeriodComparison.previousExpense)
  };
}

export async function getOfficialReportsData(input: {
  userId: string;
  preset: ReportsPeriodPreset;
  accountId?: string;
  categoryId?: string;
}) {
  const earliestLedgerDate = await ledgerRepo.oldestVisiblePostedAt({
    userId: input.userId,
    accountId: input.accountId,
    categoryId: input.categoryId
  });
  const period = buildPeriodComparison(input.preset, {
    now: new Date(),
    earliestDate:
      earliestLedgerDate ??
      (await transactionsRepo.oldestPostedAt(input.userId, { excluded: false })) ??
      undefined
  });
  const mergedRange = {
    from:
      period.current.start.getTime() <= period.previous.start.getTime()
        ? period.current.start
        : period.previous.start,
    to:
      period.current.end.getTime() >= period.previous.end.getTime()
        ? period.current.end
        : period.previous.end
  };

  const useLedger = await shouldUseLedgerAnalytics({
    userId: input.userId,
    from: mergedRange.from,
    to: mergedRange.to,
    accountId: input.accountId,
    categoryId: input.categoryId
  });

  return useLedger ? buildLedgerReportsPayload(input) : buildLegacyReportsPayload(input);
}

export async function getOfficialCashflowData(input: {
  userId: string;
  period: CashflowPeriodKey;
  accountId?: string;
}) {
  const latestLedgerDate = await ledgerRepo.latestVisiblePostedAt({
    userId: input.userId,
    accountId: input.accountId
  });
  const referenceDate = latestLedgerDate ?? (await transactionsRepo.latestPostedAt(input.userId, { excluded: false })) ?? new Date();
  const currentRange = resolveCurrentRange(input.period, referenceDate);
  const previousRange = resolvePreviousRange(currentRange);

  const useLedger = await shouldUseLedgerAnalytics({
    userId: input.userId,
    from: previousRange.from,
    to: currentRange.to,
    accountId: input.accountId
  });

  return useLedger ? buildLedgerCashflowPayload(input) : buildLegacyCashflowPayload(input);
}
