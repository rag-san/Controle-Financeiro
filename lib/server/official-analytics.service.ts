import { eachMonthOfInterval, format } from "date-fns";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { themeColors } from "@/src/lib/theme/colors";
import {
  sumBudgetMetrics,
  sumCashFlowMetrics,
  type FinancialAccountType,
  type NormalizedTransaction
} from "@/lib/finance/normalized-transactions";
import { getFinancialBreakdownSnapshot } from "@/lib/server/financial-breakdown.service";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";
import { ledgerRepo } from "@/lib/server/ledger.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import type { CategoryDTO } from "@/lib/types";
import { buildReportsModelFromPrepared } from "@/src/features/reports/buildReportsModel";
import type {
  ReportPreparedTransaction,
  ReportsCashSummary,
  ReportsPeriodComparison,
  ReportsPeriodPreset
} from "@/src/features/reports/types";
import { buildPeriodComparison } from "@/src/features/reports/utils/period";
import {
  formatRange,
  resolveCurrentRange,
  resolvePreviousRange,
  toComparisonMetric
} from "@/src/features/cashflow/utils/cashflow";
import type {
  CashflowPeriodKey,
  DateRange,
  ExpensesStackedChartData,
  IncomeRow,
  NetResultRow
} from "@/src/features/cashflow/types";
import { extractMerchantKey } from "@/src/features/insights/utils/merchant";

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function inRange(date: Date, range: DateRange): boolean {
  const time = date.getTime();
  return time >= range.from.getTime() && time <= range.to.getTime();
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

async function getLegacyScopedPostedBounds(input: {
  userId: string;
  accountId?: string;
  categoryId?: string;
}): Promise<{ latest: Date | null; earliest: Date | null }> {
  const filter = {
    userId: input.userId,
    accountId: input.accountId,
    categoryId: input.categoryId,
    excluded: false,
    hideCardPaymentMirrorInflow: true
  } as const;

  const [latestRows, earliestRows] = await Promise.all([
    transactionsRepo.listPaged(filter, { page: 1, pageSize: 1 }, { sort: "date_desc" }),
    transactionsRepo.listPaged(filter, { page: 1, pageSize: 1 }, { sort: "date_asc" })
  ]);

  return {
    latest: latestRows[0]?.date ?? null,
    earliest: earliestRows[0]?.date ?? null
  };
}

async function resolveReportsPeriod(input: {
  userId: string;
  preset: ReportsPeriodPreset;
  accountId?: string;
  categoryId?: string;
}): Promise<ReportsPeriodComparison> {
  const [ledgerLatest, ledgerEarliest, legacyBounds] = await Promise.all([
    ledgerRepo.latestVisiblePostedAt({
      userId: input.userId,
      accountId: input.accountId,
      categoryId: input.categoryId
    }),
    ledgerRepo.oldestVisiblePostedAt({
      userId: input.userId,
      accountId: input.accountId,
      categoryId: input.categoryId
    }),
    getLegacyScopedPostedBounds({
      userId: input.userId,
      accountId: input.accountId,
      categoryId: input.categoryId
    })
  ]);

  return buildPeriodComparison(input.preset, {
    now: ledgerLatest ?? legacyBounds.latest ?? new Date(),
    earliestDate: ledgerEarliest ?? legacyBounds.earliest ?? undefined
  });
}

type PreparedCashEntry = {
  id: string;
  postedAt: Date;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
  categoryName: string;
};

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


function isCashAccount(type: FinancialAccountType | null | undefined): boolean {
  return type === "checking" || type === "cash";
}

function toNormalizedEntryDate(entry: NormalizedTransaction): Date {
  return new Date(entry.date);
}

function isNormalizedEntryInRange(entry: NormalizedTransaction, range: DateRange): boolean {
  const timestamp = toNormalizedEntryDate(entry).getTime();
  return timestamp >= range.from.getTime() && timestamp <= range.to.getTime();
}

function resolveNormalizedCategory(
  entry: NormalizedTransaction,
  categoriesById: Map<string, CategoryDTO>
): {
  id: string | null;
  name: string;
  color: string;
  icon: string | null;
  parentId: string | null;
  parentName: string | null;
} {
  const category = entry.categoryId ? categoriesById.get(entry.categoryId) : null;
  const name = category?.name?.trim() || "Sem categoria";
  const parentId = category?.parentId ?? null;
  const parentName = parentId ? categoriesById.get(parentId)?.name?.trim() ?? null : null;

  return {
    id: category?.id ?? entry.categoryId ?? null,
    name,
    color: category?.color ?? themeColors.mutedForeground,
    icon: category?.icon ?? null,
    parentId,
    parentName
  };
}

function buildMerchantKeyFromNormalized(entry: NormalizedTransaction): string {
  return extractMerchantKey({
    id: entry.id,
    accountId: entry.accountId ?? "",
    categoryId: entry.categoryId ?? null,
    importBatchId: entry.importBatchId ?? null,
    date: entry.date,
    description: entry.descriptionOriginal,
    amount: entry.signedAmount,
    type:
      entry.budgetImpact === "counts_as_income"
        ? "income"
        : entry.budgetImpact === "counts_as_expense"
          ? "expense"
          : "transfer",
    direction: entry.direction === "inflow" ? "in" : "out",
    excluded: entry.excluded,
    isInternalTransfer: entry.isInternalTransfer,
    status: "posted",
    transferGroupId: null,
    transferPeerTxId: null,
    transferFromAccountId: null,
    transferToAccountId: null,
    raw: null,
    account: {
      id: entry.accountId ?? "",
      name: entry.accountName ?? "Conta",
      type: entry.accountType ?? "checking",
      institution: null,
      currency: "BRL",
      parentAccountId: null
    },
    category: null
  });
}

function toPreparedNormalizedReportTransaction(
  entry: NormalizedTransaction,
  categoriesById: Map<string, CategoryDTO>
): ReportPreparedTransaction {
  const category = resolveNormalizedCategory(entry, categoriesById);
  const incomeCents =
    entry.budgetImpact === "counts_as_income" ? Math.round(entry.budgetSignedAmount * 100) : 0;
  const expenseCents =
    entry.budgetImpact === "counts_as_expense" ? Math.round(-entry.budgetSignedAmount * 100) : 0;
  const type: ReportPreparedTransaction["type"] =
    entry.budgetImpact === "counts_as_income"
      ? "income"
      : entry.budgetImpact === "counts_as_expense"
        ? "expense"
        : "transfer";
  const date = toNormalizedEntryDate(entry);

  return {
    id: entry.id,
    date,
    timestamp: date.getTime(),
    amount: round2(entry.signedAmount),
    absAmount: round2(entry.amount),
    type,
    incomeCents,
    expenseCents,
    description: entry.descriptionOriginal,
    accountId: entry.accountId ?? "",
    accountName: entry.accountName?.trim() || "Conta",
    categoryId: category.id,
    parentCategoryId: category.parentId,
    parentCategoryName: category.parentName,
    categoryName: category.name,
    categoryColor: category.color,
    categoryIcon: category.icon,
    merchantKey: buildMerchantKeyFromNormalized(entry)
  };
}

function resolveScopedCashEntryAmount(input: {
  entry: NormalizedTransaction;
  scopedAccountId?: string;
  scopedAccountType?: FinancialAccountType | null;
}): number {
  if (!input.scopedAccountId) {
    return input.entry.overallCashFlowSignedAmount;
  }

  if (!isCashAccount(input.scopedAccountType)) {
    return 0;
  }

  if (input.entry.accountId !== input.scopedAccountId) {
    return 0;
  }

  return input.entry.accountBalanceSignedAmount;
}

function resolveNormalizedCashCategoryName(
  entry: NormalizedTransaction,
  categoriesById: Map<string, CategoryDTO>
): string {
  if (entry.nature === "credit_card_payment") {
    return "Pagamento de fatura";
  }
  if (entry.nature === "fee") {
    return "Tarifas";
  }
  if (entry.nature === "refund") {
    return "Estornos";
  }
  if (entry.categoryId) {
    const category = categoriesById.get(entry.categoryId);
    if (category?.name?.trim()) {
      return category.name.trim();
    }
  }
  return "Sem categoria";
}

function toPreparedNormalizedCashEntry(
  entry: NormalizedTransaction,
  categoriesById: Map<string, CategoryDTO>,
  scope: {
    scopedAccountId?: string;
    scopedAccountType?: FinancialAccountType | null;
  }
): PreparedCashEntry | null {
  const signedAmount = resolveScopedCashEntryAmount({
    entry,
    scopedAccountId: scope.scopedAccountId,
    scopedAccountType: scope.scopedAccountType
  });

  if (!Number.isFinite(signedAmount) || signedAmount === 0) {
    return null;
  }

  const netCents = Math.round(signedAmount * 100);
  const postedAt = toNormalizedEntryDate(entry);

  return {
    id: entry.id,
    postedAt,
    inflowCents: Math.max(netCents, 0),
    outflowCents: Math.max(-netCents, 0),
    netCents,
    categoryName: resolveNormalizedCashCategoryName(entry, categoriesById)
  };
}

function resolveCashBalanceFromAccounts(
  accounts: Awaited<ReturnType<typeof accountsRepo.listByUserWithBalance>>,
  accountId?: string
): number {
  return round2(
    accounts
      .filter((account) => {
        if (!isCashAccount(account.type)) {
          return false;
        }
        return accountId ? account.id === accountId : true;
      })
      .reduce((sum, account) => sum + (account.currentBalance ?? 0), 0)
  );
}

async function buildNormalizedReportsPayload(input: {
  userId: string;
  period: ReportsPeriodComparison;
  accountId?: string;
  categoryId?: string;
}) {
  const mergedRange = {
    from:
      input.period.current.start.getTime() <= input.period.previous.start.getTime()
        ? input.period.current.start
        : input.period.previous.start,
    to:
      input.period.current.end.getTime() >= input.period.previous.end.getTime()
        ? input.period.current.end
        : input.period.previous.end
  };

  const [categories, accounts, accountsWithBalance, normalizedScope, financeBreakdownSnapshot] = await Promise.all([
    categoriesRepo.listByUser(input.userId),
    accountsRepo.listByUser(input.userId),
    accountsRepo.listByUserWithBalance(input.userId),
    loadNormalizedTransactionsForScope({
      userId: input.userId,
      from: mergedRange.from,
      to: mergedRange.to,
      accountId: input.accountId,
      categoryId: input.categoryId,
      excluded: false,
      hideCardPaymentMirrorInflow: true
    }),
    getFinancialBreakdownSnapshot({
      userId: input.userId,
      currentFrom: input.period.current.start,
      currentTo: input.period.current.end,
      accountId: input.accountId,
      categoryId: input.categoryId
    })
  ]);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const preparedTransactions = normalizedScope.entries.map((entry) =>
    toPreparedNormalizedReportTransaction(entry, categoriesById)
  );
  const currentEntries = normalizedScope.entries.filter((entry) =>
    isNormalizedEntryInRange(entry, { from: input.period.current.start, to: input.period.current.end })
  );
  const previousEntries = normalizedScope.entries.filter((entry) =>
    isNormalizedEntryInRange(entry, { from: input.period.previous.start, to: input.period.previous.end })
  );
  const currentCash = sumCashFlowMetrics(currentEntries, {
    scopedAccountId: input.accountId ?? null,
    scopedAccountType: normalizedScope.scopedAccountType
  });
  const previousCash = sumCashFlowMetrics(previousEntries, {
    scopedAccountId: input.accountId ?? null,
    scopedAccountType: normalizedScope.scopedAccountType
  });

  return {
    period: input.period,
    categories,
    accounts,
    model: {
      ...buildReportsModelFromPrepared({
        transactions: preparedTransactions,
        period: input.period,
        cashSummary: buildReportsCashSummary({
          inflow: currentCash.inflow,
          outflow: currentCash.outflow,
          net: currentCash.net,
          previousInflow: previousCash.inflow,
          previousOutflow: previousCash.outflow,
          previousNet: previousCash.net,
          cashBalance: resolveCashBalanceFromAccounts(accountsWithBalance, input.accountId)
        })
      }),
      financeBreakdown: financeBreakdownSnapshot.breakdown
    }
  };
}

async function buildNormalizedCashflowPayload(input: {
  userId: string;
  period: CashflowPeriodKey;
  accountId?: string;
}) {
  const latestLedgerDate = await ledgerRepo.latestVisiblePostedAt({
    userId: input.userId,
    accountId: input.accountId
  });
  const latestLegacyDate = await transactionsRepo.latestPostedAt(input.userId, {
    excluded: false
  });
  const referenceDate =
    latestLedgerDate && latestLegacyDate
      ? latestLedgerDate.getTime() >= latestLegacyDate.getTime()
        ? latestLedgerDate
        : latestLegacyDate
      : latestLedgerDate ?? latestLegacyDate ?? new Date();
  const currentRange = resolveCurrentRange(input.period, referenceDate);
  const previousRange = resolvePreviousRange(currentRange);
  const mergedRange = {
    from: previousRange.from,
    to: currentRange.to
  };

  const [categories, accountsWithBalance, normalizedScope, financeBreakdownSnapshot] = await Promise.all([
    categoriesRepo.listByUser(input.userId),
    accountsRepo.listByUserWithBalance(input.userId),
    loadNormalizedTransactionsForScope({
      userId: input.userId,
      from: mergedRange.from,
      to: mergedRange.to,
      accountId: input.accountId,
      excluded: false,
      hideCardPaymentMirrorInflow: true
    }),
    getFinancialBreakdownSnapshot({
      userId: input.userId,
      currentFrom: currentRange.from,
      currentTo: currentRange.to,
      accountId: input.accountId
    })
  ]);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const currentEntries = normalizedScope.entries.filter((entry) =>
    isNormalizedEntryInRange(entry, currentRange)
  );
  const previousEntries = normalizedScope.entries.filter((entry) =>
    isNormalizedEntryInRange(entry, previousRange)
  );
  const currentCash = sumCashFlowMetrics(currentEntries, {
    scopedAccountId: input.accountId ?? null,
    scopedAccountType: normalizedScope.scopedAccountType
  });
  const previousCash = sumCashFlowMetrics(previousEntries, {
    scopedAccountId: input.accountId ?? null,
    scopedAccountType: normalizedScope.scopedAccountType
  });
  const currentBudget = sumBudgetMetrics(currentEntries);
  const previousBudget = sumBudgetMetrics(previousEntries);
  const preparedCashEntries = normalizedScope.entries
    .map((entry) =>
      toPreparedNormalizedCashEntry(entry, categoriesById, {
        scopedAccountId: input.accountId,
        scopedAccountType: normalizedScope.scopedAccountType
      })
    )
    .filter((entry): entry is PreparedCashEntry => entry !== null);
  const currentPreparedCashEntries = preparedCashEntries.filter((entry) => inRange(entry.postedAt, currentRange));
  const previousPreparedCashEntries = preparedCashEntries.filter((entry) => inRange(entry.postedAt, previousRange));

  return {
    currentRangeLabel: formatRange(currentRange),
    previousRangeLabel: formatRange(previousRange),
    cashBalance: resolveCashBalanceFromAccounts(accountsWithBalance, input.accountId),
    netResult: toComparisonMetric(currentCash.net, previousCash.net),
    income: toComparisonMetric(currentCash.inflow, previousCash.inflow),
    expense: toComparisonMetric(currentCash.outflow, previousCash.outflow),
    netChart: buildMonthlyCashNetChart({
      currentEntries: currentPreparedCashEntries,
      currentRange,
      previousEntries: previousPreparedCashEntries,
      previousRange
    }),
    incomeChart: buildMonthlyCashInflowChart(currentPreparedCashEntries, currentRange),
    expensesChart: buildMonthlyCashOutflowStack(currentPreparedCashEntries, currentRange, 8),
    classifiedIncome: toComparisonMetric(currentBudget.income, previousBudget.income),
    classifiedExpense: toComparisonMetric(currentBudget.expense, previousBudget.expense),
    financeBreakdown: financeBreakdownSnapshot.breakdown
  };
}

export async function getOfficialReportsData(input: {
  userId: string;
  preset: ReportsPeriodPreset;
  accountId?: string;
  categoryId?: string;
}) {
  const period = await resolveReportsPeriod(input);
  return buildNormalizedReportsPayload({
    ...input,
    period
  });
}

export async function getOfficialCashflowData(input: {
  userId: string;
  period: CashflowPeriodKey;
  accountId?: string;
}) {
  return buildNormalizedCashflowPayload(input);
}
