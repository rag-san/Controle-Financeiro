import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { dbTransaction, escapeLike, fromCents, nowIso, toCents } from "@/lib/server/sql";

type TransactionRow = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  import_batch_id: string | null;
  posted_at: string;
  description: string;
  normalized_description: string;
  amount_cents: number;
  currency: string;
  type: "income" | "expense";
  status: "posted" | "pending";
  account: string | null;
  bank: string | null;
  external_id: string | null;
  imported_hash: string | null;
  raw_json: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionJoinedRow = TransactionRow & {
  account_name?: string | null;
  account_type?: "checking" | "credit" | "cash" | "investment" | null;
  account_institution?: string | null;
  account_currency?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  category_icon?: string | null;
  category_parent_id?: string | null;
};

function mapBase(row: TransactionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    importBatchId: row.import_batch_id,
    date: new Date(row.posted_at),
    description: row.description,
    normalizedDescription: row.normalized_description,
    amount: fromCents(row.amount_cents),
    currency: row.currency,
    type: row.type,
    status: row.status,
    account: row.account,
    bank: row.bank,
    externalId: row.external_id,
    importedHash: row.imported_hash,
    raw: row.raw_json ? JSON.parse(row.raw_json) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapWithRelations(row: TransactionJoinedRow) {
  const base = mapBase(row);
  return {
    ...base,
    account: {
      id: base.accountId,
      name: row.account_name ?? "",
      type: row.account_type ?? "checking",
      institution: row.account_institution ?? null,
      currency: row.account_currency ?? "BRL"
    },
    category: row.category_name
      ? {
          id: base.categoryId ?? "",
          name: row.category_name,
          color: row.category_color ?? "#94a3b8",
          icon: row.category_icon ?? null,
          parentId: row.category_parent_id ?? null
        }
      : null
  };
}

type FilterInput = {
  userId: string;
  dateFrom?: Date;
  dateTo?: Date;
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense";
  normalizedQuery?: string;
};

function buildFilterWhere(filter: FilterInput): { sql: string; params: unknown[] } {
  const clauses = ["t.user_id = ?"];
  const params: unknown[] = [filter.userId];

  if (filter.dateFrom) {
    clauses.push("t.posted_at >= ?");
    params.push(filter.dateFrom.toISOString());
  }
  if (filter.dateTo) {
    clauses.push("t.posted_at <= ?");
    params.push(filter.dateTo.toISOString());
  }
  if (filter.accountId) {
    clauses.push("t.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.categoryId) {
    clauses.push("t.category_id = ?");
    params.push(filter.categoryId);
  }
  if (filter.type) {
    clauses.push("t.type = ?");
    params.push(filter.type);
  }
  if (filter.normalizedQuery) {
    clauses.push("t.normalized_description LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(filter.normalizedQuery)}%`);
  }

  return {
    sql: clauses.join(" AND "),
    params
  };
}

export const transactionsRepo = {
  listPaged(
    filter: FilterInput,
    pagination: { page: number; pageSize: number }
  ) {
    const { sql, params } = buildFilterWhere(filter);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const rows = db
      .prepare(
        `SELECT
            t.id, t.user_id, t.account_id, t.category_id, t.import_batch_id, t.posted_at,
            t.description, t.normalized_description, t.amount_cents, t.currency, t.type, t.status,
            t.account, t.bank, t.external_id, t.imported_hash, t.raw_json, t.created_at, t.updated_at,
            a.name AS account_name, a.type AS account_type, a.institution AS account_institution, a.currency AS account_currency,
            c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.parent_id AS category_parent_id
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${sql}
         ORDER BY t.posted_at DESC, t.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pagination.pageSize, offset) as TransactionJoinedRow[];

    return rows.map(mapWithRelations);
  },

  count(filter: FilterInput): number {
    const { sql, params } = buildFilterWhere(filter);
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM transactions t WHERE ${sql}`)
      .get(...params) as { count: number };

    return row.count;
  },

  sumByType(filter: FilterInput): Array<{ type: "income" | "expense"; amount: number }> {
    const { sql, params } = buildFilterWhere(filter);
    const rows = db
      .prepare(
        `SELECT t.type, SUM(t.amount_cents) AS total_cents
         FROM transactions t
         WHERE ${sql}
         GROUP BY t.type`
      )
      .all(...params) as Array<{ type: "income" | "expense"; total_cents: number | null }>;

    return rows.map((row) => ({
      type: row.type,
      amount: fromCents(row.total_cents)
    }));
  },

  findByIdForUser(id: string, userId: string) {
    const row = db
      .prepare(
        `SELECT
            t.id, t.user_id, t.account_id, t.category_id, t.import_batch_id, t.posted_at,
            t.description, t.normalized_description, t.amount_cents, t.currency, t.type, t.status,
            t.account, t.bank, t.external_id, t.imported_hash, t.raw_json, t.created_at, t.updated_at,
            a.name AS account_name, a.type AS account_type, a.institution AS account_institution, a.currency AS account_currency,
            c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.parent_id AS category_parent_id
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = ? AND t.user_id = ?`
      )
      .get(id, userId) as TransactionJoinedRow | undefined;

    return row ? mapWithRelations(row) : null;
  },

  create(input: {
    userId: string;
    accountId: string;
    categoryId?: string | null;
    date: Date;
    description: string;
    normalizedDescription: string;
    amount: number;
    type: "income" | "expense";
    status: "posted" | "pending";
    importBatchId?: string | null;
    importedHash?: string | null;
    raw?: Record<string, unknown> | null;
  }) {
    const id = createId();
    const now = nowIso();

    db.prepare(
      `INSERT INTO transactions (
         id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
         amount_cents, currency, type, status, imported_hash, raw_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BRL', ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.accountId,
      input.categoryId ?? null,
      input.importBatchId ?? null,
      input.date.toISOString(),
      input.description,
      input.normalizedDescription,
      toCents(input.amount),
      input.type,
      input.status,
      input.importedHash ?? null,
      input.raw ? JSON.stringify(input.raw) : null,
      now,
      now
    );

    return this.findByIdForUser(id, input.userId);
  },

  createMany(
    rows: Array<{
      userId: string;
      accountId: string;
      categoryId?: string | null;
      importBatchId?: string | null;
      date: Date;
      description: string;
      normalizedDescription: string;
      amount: number;
      type: "income" | "expense";
      status: "posted" | "pending";
      importedHash?: string | null;
      raw?: Record<string, unknown> | null;
    }>
  ): { count: number } {
    if (rows.length === 0) {
      return { count: 0 };
    }

    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO transactions (
         id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
         amount_cents, currency, type, status, imported_hash, raw_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BRL', ?, ?, ?, ?, ?, ?)`
    );

    const run = db.transaction(() => {
      let count = 0;
      for (const row of rows) {
        insert.run(
          createId(),
          row.userId,
          row.accountId,
          row.categoryId ?? null,
          row.importBatchId ?? null,
          row.date.toISOString(),
          row.description,
          row.normalizedDescription,
          toCents(row.amount),
          row.type,
          row.status,
          row.importedHash ?? null,
          row.raw ? JSON.stringify(row.raw) : null,
          now,
          now
        );
        count += 1;
      }
      return count;
    });

    return { count: run() };
  },

  update(input: {
    id: string;
    userId: string;
    accountId?: string;
    categoryId?: string | null;
    date?: Date;
    description?: string;
    normalizedDescription?: string;
    amount?: number;
    type?: "income" | "expense";
    status?: "posted" | "pending";
  }) {
    const existing = this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;

    const nextDescription = input.description ?? existing.description;
    const nextNormalizedDescription = input.normalizedDescription ?? existing.normalizedDescription;
    const nextAmount = input.amount ?? existing.amount;
    const nextType = input.type ?? (nextAmount >= 0 ? "income" : "expense");

    db.prepare(
      `UPDATE transactions
       SET account_id = ?, category_id = ?, posted_at = ?, description = ?, normalized_description = ?,
           amount_cents = ?, type = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.accountId ?? existing.accountId,
      input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      (input.date ?? existing.date).toISOString(),
      nextDescription,
      nextNormalizedDescription,
      toCents(nextAmount),
      nextType,
      input.status ?? existing.status,
      nowIso(),
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  deleteByIdForUser(id: string, userId: string): number {
    const result = db
      .prepare(
        `DELETE FROM transactions
         WHERE id = ? AND user_id = ?`
      )
      .run(id, userId);
    return result.changes;
  },

  deleteManyByIdsForUser(ids: string[], userId: string): number {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => "?").join(",");
    const result = db
      .prepare(
        `DELETE FROM transactions
         WHERE user_id = ? AND id IN (${placeholders})`
      )
      .run(userId, ...ids);

    return result.changes;
  },

  listForRuleReapply(userId: string, onlyUncategorized: boolean) {
    const rows = db
      .prepare(
        `SELECT id, description, normalized_description, amount_cents, account_id, category_id
         FROM transactions
         WHERE user_id = ?
           ${onlyUncategorized ? "AND category_id IS NULL" : ""}
         ORDER BY posted_at DESC, created_at DESC`
      )
      .all(userId) as Array<{
        id: string;
        description: string;
        normalized_description: string;
        amount_cents: number;
        account_id: string;
        category_id: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      normalizedDescription: row.normalized_description,
      amount: fromCents(row.amount_cents),
      accountId: row.account_id,
      categoryId: row.category_id
    }));
  },

  bulkUpdateCategory(updates: Array<{ id: string; categoryId: string }>) {
    if (updates.length === 0) return 0;
    const stmt = db.prepare(
      `UPDATE transactions
       SET category_id = ?, updated_at = ?
       WHERE id = ?`
    );

    return dbTransaction(() => {
      let count = 0;
      const now = nowIso();
      for (const update of updates) {
        const result = stmt.run(update.categoryId, now, update.id);
        count += result.changes;
      }
      return count;
    });
  },

  findImportedHashes(userId: string, hashes: string[]) {
    if (hashes.length === 0) return [];
    const placeholders = hashes.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT imported_hash
         FROM transactions
         WHERE user_id = ? AND imported_hash IN (${placeholders})`
      )
      .all(userId, ...hashes) as Array<{ imported_hash: string | null }>;

    return rows.map((row) => row.imported_hash).filter((value): value is string => Boolean(value));
  },

  countByAccount(userId: string, accountId: string): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE user_id = ? AND account_id = ?`
      )
      .get(userId, accountId) as { count: number };

    return row.count;
  },

  listByDateRange(userId: string, from: Date, to: Date, withCategory = false) {
    const rows = db
      .prepare(
        `SELECT id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
                amount_cents, currency, type, status, account, bank, external_id, imported_hash, raw_json, created_at, updated_at
         FROM transactions
         WHERE user_id = ? AND posted_at >= ? AND posted_at <= ?
         ORDER BY posted_at ASC`
      )
      .all(userId, from.toISOString(), to.toISOString()) as TransactionRow[];

    if (!withCategory) {
      return rows.map(mapBase);
    }
    return rows.map(mapBase);
  },

  listRecentAmounts(userId: string, take: number) {
    const rows = db
      .prepare(
        `SELECT amount_cents
         FROM transactions
         WHERE user_id = ?
         ORDER BY posted_at DESC
         LIMIT ?`
      )
      .all(userId, take) as Array<{ amount_cents: number }>;

    return rows.map((row) => ({ amount: fromCents(row.amount_cents) }));
  },

  latestPostedAt(userId: string): Date | null {
    const row = db
      .prepare(
        `SELECT posted_at
         FROM transactions
         WHERE user_id = ?
         ORDER BY posted_at DESC
         LIMIT 1`
      )
      .get(userId) as { posted_at: string } | undefined;

    if (!row?.posted_at) {
      return null;
    }

    const parsed = new Date(row.posted_at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },

  listMetaForUser(userId: string) {
    return {
      accounts: accountsRepo.listByUser(userId),
      categories: categoriesRepo.listByUser(userId)
    };
  }
};



