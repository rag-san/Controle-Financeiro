export type AccountDTO = {
  id: string;
  name: string;
  type: "checking" | "credit" | "cash" | "investment";
  institution?: string | null;
  currency: string;
  parentAccountId?: string | null;
  currentBalance?: number;
  confirmedBalance?: {
    amount: number;
    date: string;
    sourceType: "csv" | "ofx" | "pdf" | "manual";
    fileName: string;
    importBatchId: string | null;
    openingBalance: number | null;
    computedClosingBalance: number | null;
    rowCount: number;
    balanceAnchorCount: number;
    importedAt: string;
    difference: number;
  } | null;
  cardMetrics?: {
    spending: number;
    payments: number;
    openDebt: number;
    futureInstallments: number;
    totalCommitted: number;
  };
};

export type CategoryDTO = {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  parentId?: string | null;
};

export type TransactionDTO = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  importBatchId?: string | null;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  direction?: "in" | "out";
  excluded?: boolean;
  isInternalTransfer?: boolean;
  status: "posted" | "pending";
  transferGroupId?: string | null;
  transferPeerTxId?: string | null;
  transferFromAccountId?: string | null;
  transferToAccountId?: string | null;
  raw?: Record<string, unknown> | null;
  account: AccountDTO;
  category?: CategoryDTO | null;
};
