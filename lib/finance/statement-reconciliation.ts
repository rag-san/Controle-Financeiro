export type StatementReconciliationAccountType = "checking" | "cash" | "credit" | "investment";

export type StatementReconciliationRow = {
  accountId: string;
  accountType: StatementReconciliationAccountType;
  date: Date;
  sequence: number;
  amount: number;
  balanceAfter?: number | null;
  description?: string | null;
};

export type StatementReconciliationMismatch = {
  accountId: string;
  date: string;
  sequence: number;
  description: string | null;
  delta: number;
  expectedBalanceAfter: number;
  actualBalanceAfter: number;
};

export type StatementReconciliationAccountResult = {
  accountId: string;
  rowCount: number;
  balanceAnchorCount: number;
  openingBalance: number | null;
  closingBalance: number | null;
  closingBalanceDate: string | null;
  closingBalanceSequence: number | null;
  computedClosingBalance: number | null;
  mismatchCount: number;
  mismatches: StatementReconciliationMismatch[];
};

export type StatementReconciliationResult = {
  ok: boolean;
  checkedAccountCount: number;
  anchoredAccountCount: number;
  totalRows: number;
  mismatchCount: number;
  accounts: StatementReconciliationAccountResult[];
};

const CASH_ACCOUNT_TYPES = new Set<StatementReconciliationAccountType>(["checking", "cash"]);
const DEFAULT_TOLERANCE = 0.01;
const MAX_MISMATCHES_PER_ACCOUNT = 5;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function hasBalanceAnchor(row: StatementReconciliationRow): boolean {
  return Number.isFinite(row.balanceAfter);
}

function evaluateOrderedRows(
  accountId: string,
  orderedRows: StatementReconciliationRow[],
  tolerance: number
): StatementReconciliationAccountResult & { mismatchMagnitude: number } {
  const firstAnchorIndex = orderedRows.findIndex((row) => hasBalanceAnchor(row));
  const balanceAnchorCount = orderedRows.filter((row) => hasBalanceAnchor(row)).length;

  if (firstAnchorIndex < 0) {
    return {
      accountId,
      rowCount: orderedRows.length,
      balanceAnchorCount: 0,
      openingBalance: null,
      closingBalance: null,
      closingBalanceDate: null,
      closingBalanceSequence: null,
      computedClosingBalance: null,
      mismatchCount: 0,
      mismatches: [],
      mismatchMagnitude: 0
    };
  }

  const firstAnchor = orderedRows[firstAnchorIndex]!;
  const cumulativeBeforeAnchor = orderedRows
    .slice(0, firstAnchorIndex + 1)
    .reduce((sum, row) => sum + row.amount, 0);
  const openingBalance = round2(Number(firstAnchor.balanceAfter) - cumulativeBeforeAnchor);

  let runningBalance = openingBalance;
  let closingBalance: number | null = null;
  let closingBalanceDate: string | null = null;
  let closingBalanceSequence: number | null = null;
  let mismatchMagnitude = 0;
  const mismatches: StatementReconciliationMismatch[] = [];

  for (const row of orderedRows) {
    runningBalance = round2(runningBalance + row.amount);

    if (!hasBalanceAnchor(row)) {
      continue;
    }

    const actualBalanceAfter = round2(Number(row.balanceAfter));
    const delta = round2(runningBalance - actualBalanceAfter);
    closingBalance = actualBalanceAfter;
    closingBalanceDate = row.date.toISOString();
    closingBalanceSequence = row.sequence;

    if (Math.abs(delta) > tolerance) {
      mismatchMagnitude = round2(mismatchMagnitude + Math.abs(delta));
      if (mismatches.length < MAX_MISMATCHES_PER_ACCOUNT) {
        mismatches.push({
          accountId,
          date: row.date.toISOString(),
          sequence: row.sequence,
          description: row.description?.trim() || null,
          delta,
          expectedBalanceAfter: runningBalance,
          actualBalanceAfter
        });
      }
    }
  }

  return {
    accountId,
    rowCount: orderedRows.length,
    balanceAnchorCount,
    openingBalance,
    closingBalance,
    closingBalanceDate,
    closingBalanceSequence,
    computedClosingBalance: round2(runningBalance),
    mismatchCount: mismatches.length,
    mismatches,
    mismatchMagnitude
  };
}

export function reconcileAccountStatement(
  rows: StatementReconciliationRow[],
  options?: { tolerance?: number }
): StatementReconciliationResult {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;
  const grouped = new Map<string, StatementReconciliationRow[]>();

  for (const row of rows) {
    if (!CASH_ACCOUNT_TYPES.has(row.accountType)) {
      continue;
    }
    if (!Number.isFinite(row.amount)) {
      continue;
    }

    const bucket = grouped.get(row.accountId) ?? [];
    bucket.push({
      ...row,
      amount: round2(row.amount),
      balanceAfter: hasBalanceAnchor(row) ? round2(Number(row.balanceAfter)) : null
    });
    grouped.set(row.accountId, bucket);
  }

  const accounts: StatementReconciliationAccountResult[] = [];

  for (const [accountId, accountRows] of grouped.entries()) {
    const orderedRows = [...accountRows].sort((left, right) => left.sequence - right.sequence);
    const forward = evaluateOrderedRows(accountId, orderedRows, tolerance);
    const reversed = evaluateOrderedRows(accountId, [...orderedRows].reverse(), tolerance);
    const best =
      reversed.mismatchCount < forward.mismatchCount ||
      (reversed.mismatchCount === forward.mismatchCount &&
        reversed.mismatchMagnitude < forward.mismatchMagnitude)
        ? reversed
        : forward;

    accounts.push({
      accountId: best.accountId,
      rowCount: best.rowCount,
      balanceAnchorCount: best.balanceAnchorCount,
      openingBalance: best.openingBalance,
      closingBalance: best.closingBalance,
      closingBalanceDate: best.closingBalanceDate,
      closingBalanceSequence: best.closingBalanceSequence,
      computedClosingBalance: best.computedClosingBalance,
      mismatchCount: best.mismatchCount,
      mismatches: best.mismatches
    });
  }

  const anchoredAccountCount = accounts.filter((account) => account.balanceAnchorCount > 0).length;
  const mismatchCount = accounts.reduce((sum, account) => sum + account.mismatchCount, 0);

  return {
    ok: mismatchCount === 0,
    checkedAccountCount: accounts.length,
    anchoredAccountCount,
    totalRows: accounts.reduce((sum, account) => sum + account.rowCount, 0),
    mismatchCount,
    accounts
  };
}
