import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { fromCents, nowIso } from "@/lib/server/sql";

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: "checking" | "credit" | "cash" | "investment";
  institution: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

type AccountBalanceRow = {
  account_id: string;
  total_cents: number | null;
};

function mapAccount(row: AccountRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    institution: row.institution,
    currency: row.currency,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const accountsRepo = {
  listByUser(userId: string) {
    const rows = db
      .prepare(
        `SELECT id, user_id, name, type, institution, currency, created_at, updated_at
         FROM accounts
         WHERE user_id = ?
         ORDER BY type ASC, name ASC`
      )
      .all(userId) as AccountRow[];

    return rows.map(mapAccount);
  },

  listByUserWithBalance(userId: string) {
    const accounts = this.listByUser(userId);
    const balanceRows = db
      .prepare(
        `SELECT account_id, SUM(amount_cents) AS total_cents
         FROM transactions
         WHERE user_id = ?
         GROUP BY account_id`
      )
      .all(userId) as AccountBalanceRow[];

    const balanceByAccountId = new Map(balanceRows.map((row) => [row.account_id, fromCents(row.total_cents)]));

    return accounts.map((account) => ({
      ...account,
      currentBalance: balanceByAccountId.get(account.id) ?? 0
    }));
  },

  findByIdForUser(id: string, userId: string) {
    const row = db
      .prepare(
        `SELECT id, user_id, name, type, institution, currency, created_at, updated_at
         FROM accounts
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId) as AccountRow | undefined;

    return row ? mapAccount(row) : null;
  },

  create(input: {
    userId: string;
    name: string;
    type: "checking" | "credit" | "cash" | "investment";
    institution?: string | null;
    currency?: string;
  }) {
    const id = createId();
    const now = nowIso();
    db.prepare(
      `INSERT INTO accounts (id, user_id, name, type, institution, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.name,
      input.type,
      input.institution ?? null,
      (input.currency ?? "BRL").toUpperCase(),
      now,
      now
    );

    return this.findByIdForUser(id, input.userId);
  },

  update(input: {
    id: string;
    userId: string;
    name?: string;
    type?: "checking" | "credit" | "cash" | "investment";
    institution?: string | null;
    currency?: string;
  }) {
    const existing = this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;

    const now = nowIso();
    db.prepare(
      `UPDATE accounts
       SET name = ?, type = ?, institution = ?, currency = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.name ?? existing.name,
      input.type ?? existing.type,
      input.institution !== undefined ? input.institution : existing.institution,
      (input.currency ?? existing.currency).toUpperCase(),
      now,
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  countTransactions(userId: string, accountId: string): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM transactions
         WHERE user_id = ? AND account_id = ?`
      )
      .get(userId, accountId) as { count: number };

    return row.count;
  },

  delete(input: { id: string; userId: string }): number {
    const result = db
      .prepare(
        `DELETE FROM accounts
         WHERE id = ? AND user_id = ?`
      )
      .run(input.id, input.userId);

    return result.changes;
  }
};



