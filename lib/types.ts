export type AccountDTO = {
  id: string;
  name: string;
  type: "checking" | "credit" | "cash" | "investment";
  institution?: string | null;
  currency: string;
  parentAccountId?: string | null;
  currentBalance?: number;
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
  isInternalTransfer?: boolean;
  status: "posted" | "pending";
  transferGroupId?: string | null;
  transferPeerTxId?: string | null;
  transferFromAccountId?: string | null;
  transferToAccountId?: string | null;
  account: AccountDTO;
  category?: CategoryDTO | null;
};
