type BalanceAnchoredType = "income" | "expense" | "transfer";

export type BalanceAnchoredAmountRow = {
  amount: number;
  balanceAfter?: number | null;
  type?: BalanceAnchoredType;
  raw?: Record<string, unknown>;
};

export type BalanceAnchorOrientation = "forward" | "reverse";

export type BalanceSignInferenceResult<T extends BalanceAnchoredAmountRow> = {
  rows: T[];
  orientation: BalanceAnchorOrientation | null;
  matchedCount: number;
  adjustedCount: number;
  mismatchCount: number;
};

type Candidate = {
  orientation: BalanceAnchorOrientation;
  inferredByIndex: Map<number, number>;
  matchedCount: number;
  adjustedCount: number;
  mismatchCount: number;
  mismatchMagnitude: number;
};

const DEFAULT_TOLERANCE = 0.01;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? round2(numeric) : null;
}

function sameMoneyValue(left: number, right: number, tolerance: number): boolean {
  return Math.abs(round2(left - right)) <= tolerance;
}

function magnitudeMatches(left: number, right: number, tolerance: number): boolean {
  return Math.abs(round2(Math.abs(left) - Math.abs(right))) <= tolerance;
}

function evaluateCandidate<T extends BalanceAnchoredAmountRow>(
  rows: T[],
  orientation: BalanceAnchorOrientation,
  openingBalance: number | null,
  tolerance: number
): Candidate {
  const indexedRows = rows.map((row, index) => ({ row, index }));
  const orderedRows = orientation === "reverse" ? [...indexedRows].reverse() : indexedRows;
  const inferredByIndex = new Map<number, number>();
  let previousBalance: number | null = null;
  let matchedCount = 0;
  let adjustedCount = 0;
  let mismatchCount = 0;
  let mismatchMagnitude = 0;

  for (const { row, index } of orderedRows) {
    const balanceAfter = finiteNumber(row.balanceAfter);
    if (balanceAfter === null) {
      continue;
    }

    let inferredAmount: number | null = null;
    if (previousBalance !== null) {
      inferredAmount = round2(balanceAfter - previousBalance);
    } else if (openingBalance !== null) {
      inferredAmount = round2(balanceAfter - openingBalance);
    }

    previousBalance = balanceAfter;

    if (inferredAmount === null) {
      continue;
    }

    const currentAmount = finiteNumber(row.amount);
    if (currentAmount === null) {
      continue;
    }

    if (magnitudeMatches(inferredAmount, currentAmount, tolerance)) {
      inferredByIndex.set(index, inferredAmount);
      matchedCount += 1;
      if (!sameMoneyValue(inferredAmount, currentAmount, tolerance)) {
        adjustedCount += 1;
      }
      continue;
    }

    mismatchCount += 1;
    mismatchMagnitude = round2(
      mismatchMagnitude + Math.abs(round2(Math.abs(inferredAmount) - Math.abs(currentAmount)))
    );
  }

  return {
    orientation,
    inferredByIndex,
    matchedCount,
    adjustedCount,
    mismatchCount,
    mismatchMagnitude
  };
}

function pickBestCandidate(left: Candidate, right: Candidate): Candidate {
  if (right.matchedCount !== left.matchedCount) {
    return right.matchedCount > left.matchedCount ? right : left;
  }

  if (right.mismatchCount !== left.mismatchCount) {
    return right.mismatchCount < left.mismatchCount ? right : left;
  }

  if (right.mismatchMagnitude !== left.mismatchMagnitude) {
    return right.mismatchMagnitude < left.mismatchMagnitude ? right : left;
  }

  return left;
}

function typeFromAmount(amount: number, currentType?: BalanceAnchoredType): BalanceAnchoredType {
  if (currentType === "transfer") {
    return "transfer";
  }
  return amount >= 0 ? "income" : "expense";
}

export function inferSignedAmountsFromBalanceAnchors<T extends BalanceAnchoredAmountRow>(
  rows: T[],
  options: {
    openingBalance?: number | null;
    tolerance?: number;
  } = {}
): BalanceSignInferenceResult<T> {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const openingBalance = finiteNumber(options.openingBalance);

  if (rows.length === 0) {
    return {
      rows,
      orientation: null,
      matchedCount: 0,
      adjustedCount: 0,
      mismatchCount: 0
    };
  }

  const forward = evaluateCandidate(rows, "forward", openingBalance, tolerance);
  const reversed = evaluateCandidate(rows, "reverse", openingBalance, tolerance);
  const best = pickBestCandidate(forward, reversed);

  if (best.matchedCount === 0) {
    return {
      rows,
      orientation: null,
      matchedCount: 0,
      adjustedCount: 0,
      mismatchCount: best.mismatchCount
    };
  }

  const nextRows = rows.map((row, index) => {
    const inferredAmount = best.inferredByIndex.get(index);
    if (inferredAmount === undefined) {
      return row;
    }

    const amount = round2(inferredAmount);
    const type = typeFromAmount(amount, row.type);
    const adjusted = !sameMoneyValue(amount, row.amount, tolerance);

    return {
      ...row,
      amount,
      type,
      raw:
        row.raw && adjusted
          ? {
              ...row.raw,
              balanceSignInference: {
                source: "balanceAfter",
                orientation: best.orientation,
                originalAmount: row.amount,
                inferredAmount: amount
              }
            }
          : row.raw
    };
  });

  return {
    rows: nextRows,
    orientation: best.orientation,
    matchedCount: best.matchedCount,
    adjustedCount: best.adjustedCount,
    mismatchCount: best.mismatchCount
  };
}
