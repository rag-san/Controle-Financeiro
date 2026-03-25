import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { shouldUseLedgerForAnalytics } from "@/lib/server/analytics-source";
import { fromCents, nowIso } from "@/lib/server/sql";

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: "checking" | "credit" | "cash" | "investment";
  institution: string | null;
  currency: string;
  parent_account_id: string | null;
  created_at: string;
  updated_at: string;
};

type AccountBalanceRow = {
  account_id: string;
  total_cents: number | null;
};

async function listLegacyBalancesByUser(userId: string): Promise<Map<string, number>> {
  const balanceRows = (await db
    .prepare(
      `SELECT account_id, SUM(amount_cents) AS total_cents
       FROM transactions
       WHERE user_id = ?
       GROUP BY account_id`
    )
    .all(userId)) as AccountBalanceRow[];

  return new Map(balanceRows.map((row) => [row.account_id, fromCents(row.total_cents)]));
}

async function listLedgerBalancesByUser(userId: string): Promise<Map<string, number>> {
  const balanceRows = (await db
    .prepare(
      `SELECT
         a.id AS account_id,
         COALESCE(
           SUM(
             CASE
               WHEN a.type = 'credit' THEN
                 CASE
                   WHEN le.type = 'cc_purchase' THEN -le.amount_cents
                   WHEN le.type = 'refund' THEN le.amount_cents
                   WHEN le.type = 'cc_payment' THEN le.amount_cents
                   ELSE 0
                 END
               ELSE
                 CASE
                   WHEN le.type = 'income' THEN le.amount_cents
                   WHEN le.type IN ('expense', 'fee') THEN -le.amount_cents
                   WHEN le.type = 'transfer' AND le.direction = 'IN' THEN le.amount_cents
                   WHEN le.type = 'transfer' AND le.direction = 'OUT' THEN -le.amount_cents
                   WHEN le.type = 'cc_payment' AND le.direction = 'IN' THEN le.amount_cents
                   WHEN le.type = 'cc_payment' AND le.direction = 'OUT' THEN -le.amount_cents
                   WHEN le.type = 'refund' AND le.direction = 'IN' THEN le.amount_cents
                   WHEN le.type = 'refund' AND le.direction = 'OUT' THEN -le.amount_cents
                   ELSE 0
                 END
             END
           ),
           0
         ) AS total_cents
       FROM accounts a
       LEFT JOIN ledger_entries le
         ON le.user_id = a.user_id
        AND (
          (a.type = 'credit' AND le.credit_card_account_id = a.id)
          OR (a.type <> 'credit' AND le.account_id = a.id)
        )
        AND (le.excluded = FALSE OR le.is_balance_adjustment = TRUE)
       WHERE a.user_id = ?
       GROUP BY a.id`
    )
    .all(userId)) as AccountBalanceRow[];

  return new Map(balanceRows.map((row) => [row.account_id, fromCents(row.total_cents)]));
}

function mapAccount(row: AccountRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    institution: row.institution,
    currency: row.currency,
    parentAccountId: row.parent_account_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const accountsRepo = {
  async listByUser(userId: string) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, name, type, institution, currency, parent_account_id, created_at, updated_at
         FROM accounts
         WHERE user_id = ?
         ORDER BY (parent_account_id IS NOT NULL) ASC, type ASC, name ASC`
      )
      .all(userId)) as AccountRow[];

    return rows.map(mapAccount);
  },

  async listByUserWithBalance(userId: string) {
    const accounts = await this.listByUser(userId);
    const useLedger = await shouldUseLedgerForAnalytics({
      userId,
      includeBalanceAdjustments: true
    });
    const balanceByAccountId = useLedger
      ? await listLedgerBalancesByUser(userId)
      : await listLegacyBalancesByUser(userId);

    return accounts.map((account) => ({
      ...account,
      currentBalance: balanceByAccountId.get(account.id) ?? 0
    }));
  },

  async findByIdForUser(id: string, userId: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, name, type, institution, currency, parent_account_id, created_at, updated_at
         FROM accounts
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId)) as AccountRow | undefined;

    return row ? mapAccount(row) : null;
  },

  async create(input: {
    userId: string;
    name: string;
    type: "checking" | "credit" | "cash" | "investment";
    institution?: string | null;
    currency?: string;
    parentAccountId?: string | null;
  }) {
    const id = createId();
    const now = nowIso();
    const parentAccountId =
      input.type === "credit" ? (input.parentAccountId !== undefined ? input.parentAccountId : null) : null;

    if (parentAccountId) {
      const parent = await this.findByIdForUser(parentAccountId, input.userId);
      if (!parent) {
        throw new Error("PARENT_ACCOUNT_NOT_FOUND");
      }
      if (parent.type === "credit") {
        throw new Error("PARENT_ACCOUNT_INVALID_TYPE");
      }
    }

    await db.prepare(
      `INSERT INTO accounts (id, user_id, name, type, institution, currency, parent_account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.name,
      input.type,
      input.institution ?? null,
      (input.currency ?? "BRL").toUpperCase(),
      parentAccountId,
      now,
      now
    );

    return this.findByIdForUser(id, input.userId);
  },

  async update(input: {
    id: string;
    userId: string;
    name?: string;
    type?: "checking" | "credit" | "cash" | "investment";
    institution?: string | null;
    currency?: string;
    parentAccountId?: string | null;
  }) {
    const existing = await this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;

    const nextType = input.type ?? existing.type;
    const requestedParentAccountId =
      input.parentAccountId !== undefined ? input.parentAccountId : existing.parentAccountId ?? null;
    const nextParentAccountId = nextType === "credit" ? requestedParentAccountId : null;

    if (nextParentAccountId) {
      if (nextParentAccountId === input.id) {
        throw new Error("PARENT_ACCOUNT_SELF_REFERENCE");
      }
      const parent = await this.findByIdForUser(nextParentAccountId, input.userId);
      if (!parent) {
        throw new Error("PARENT_ACCOUNT_NOT_FOUND");
      }
      if (parent.type === "credit") {
        throw new Error("PARENT_ACCOUNT_INVALID_TYPE");
      }
    }

    const now = nowIso();
    await db.prepare(
      `UPDATE accounts
       SET name = ?, type = ?, institution = ?, currency = ?, parent_account_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.name ?? existing.name,
      nextType,
      input.institution !== undefined ? input.institution : existing.institution,
      (input.currency ?? existing.currency).toUpperCase(),
      nextParentAccountId,
      now,
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  async countTransactions(userId: string, accountId: string): Promise<number> {
    const row = (await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM transactions
         WHERE user_id = ? AND account_id = ?`
      )
      .get(userId, accountId)) as { count: number };

    return row.count;
  },

  async delete(input: { id: string; userId: string }): Promise<number> {
    const result = await db
      .prepare(
        `DELETE FROM accounts
         WHERE id = ? AND user_id = ?`
      )
      .run(input.id, input.userId);

    return result.changes;
  }
};



