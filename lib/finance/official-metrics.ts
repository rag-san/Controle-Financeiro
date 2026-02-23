export type OfficialTransactionType = "income" | "expense" | "transfer";

export type OfficialTransactionLike = {
  type: OfficialTransactionType;
  amount: number;
};

export type OfficialFlowTotals = {
  income: number;
  expense: number;
  net: number;
  transfer: number;
};

export type OfficialFlowTotalsCents = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transferCents: number;
};

export function toAmountCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromAmountCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number((value / 100).toFixed(2));
}

export function absAmountCents(value: number): number {
  return Math.abs(toAmountCents(value));
}

export function accumulateOfficialFlowCents(
  transactions: Iterable<OfficialTransactionLike>
): OfficialFlowTotalsCents {
  let incomeCents = 0;
  let expenseCents = 0;
  let transferCents = 0;

  for (const transaction of transactions) {
    const absoluteCents = absAmountCents(transaction.amount);
    if (absoluteCents <= 0) continue;

    if (transaction.type === "income") {
      incomeCents += absoluteCents;
      continue;
    }

    if (transaction.type === "expense") {
      expenseCents += absoluteCents;
      continue;
    }

    if (transaction.type === "transfer") {
      transferCents += absoluteCents;
    }
  }

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    transferCents
  };
}

export function accumulateOfficialFlow(
  transactions: Iterable<OfficialTransactionLike>
): OfficialFlowTotals {
  const totals = accumulateOfficialFlowCents(transactions);
  return {
    income: fromAmountCents(totals.incomeCents),
    expense: fromAmountCents(totals.expenseCents),
    net: fromAmountCents(totals.netCents),
    transfer: fromAmountCents(totals.transferCents)
  };
}

export function totalsFromGroupedTypes(
  grouped: Array<{ type: OfficialTransactionType; amount: number }>
): OfficialFlowTotals {
  return accumulateOfficialFlow(grouped);
}
