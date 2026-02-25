import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { dbTransaction, escapeLike, fromCents, nowIso, toCents } from "@/lib/server/sql";

type TransactionDirection = "in" | "out";

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
  type: "income" | "expense" | "transfer";
  direction: TransactionDirection;
  is_internal_transfer: number | boolean;
  status: "posted" | "pending";
  account: string | null;
  bank: string | null;
  external_id: string | null;
  imported_hash: string | null;
  transfer_group_id: string | null;
  transfer_peer_tx_id: string | null;
  transfer_from_account_id: string | null;
  transfer_to_account_id: string | null;
  raw_json: string | null;
  created_at: string;
  updated_at: string;
};

function directionFromAmount(amount: number): TransactionDirection {
  return amount >= 0 ? "in" : "out";
}

function normalizeDirection(direction: string | null | undefined, amountCents: number): TransactionDirection {
  if (direction === "in" || direction === "out") {
    return direction;
  }
  return amountCents >= 0 ? "in" : "out";
}

function normalizeInternalTransferFlag(
  value: number | boolean | null | undefined,
  type: "income" | "expense" | "transfer"
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return type === "transfer";
}

function toDbBoolean(value: boolean): boolean {
  return value;
}

const TX_TYPE_PARAM_SQL = "?::transaction_type";
const TX_DIRECTION_PARAM_SQL = "?::transaction_direction";
const TX_TRANSFER_LITERAL_SQL = "'transfer'::transaction_type";

type TransactionJoinedRow = TransactionRow & {
  account_name?: string | null;
  account_type?: "checking" | "credit" | "cash" | "investment" | null;
  account_institution?: string | null;
  account_currency?: string | null;
  account_parent_account_id?: string | null;
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
    direction: normalizeDirection(row.direction, row.amount_cents),
    isInternalTransfer: normalizeInternalTransferFlag(row.is_internal_transfer, row.type),
    status: row.status,
    account: row.account,
    bank: row.bank,
    externalId: row.external_id,
    importedHash: row.imported_hash,
    transferGroupId: row.transfer_group_id,
    transferPeerTxId: row.transfer_peer_tx_id,
    transferFromAccountId: row.transfer_from_account_id,
    transferToAccountId: row.transfer_to_account_id,
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
      currency: row.account_currency ?? "BRL",
      parentAccountId: row.account_parent_account_id ?? null
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
  type?: "income" | "expense" | "transfer";
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
    clauses.push("t.type = ?::transaction_type");
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
  async listAll(filter: FilterInput) {
    const total = await this.count(filter);
    if (total <= 0) return [];
    return this.listPaged(filter, { page: 1, pageSize: total });
  },

  async listPaged(
    filter: FilterInput,
    pagination: { page: number; pageSize: number }
  ) {
    const { sql, params } = buildFilterWhere(filter);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const rows = (await db
      .prepare(
        `SELECT
            t.id, t.user_id, t.account_id, t.category_id, t.import_batch_id, t.posted_at,
            t.description, t.normalized_description, t.amount_cents, t.currency, t.type, t.direction, t.is_internal_transfer, t.status,
            t.account, t.bank, t.external_id, t.imported_hash, t.transfer_group_id, t.transfer_peer_tx_id, t.transfer_from_account_id, t.transfer_to_account_id, t.raw_json, t.created_at, t.updated_at,
            a.name AS account_name, a.type AS account_type, a.institution AS account_institution, a.currency AS account_currency, a.parent_account_id AS account_parent_account_id,
            c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.parent_id AS category_parent_id
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${sql}
         ORDER BY t.posted_at DESC, t.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pagination.pageSize, offset)) as TransactionJoinedRow[];

    return rows.map(mapWithRelations);
  },

  async count(filter: FilterInput): Promise<number> {
    const { sql, params } = buildFilterWhere(filter);
    const row = (await db
      .prepare(`SELECT COUNT(*) AS count FROM transactions t WHERE ${sql}`)
      .get(...params)) as { count: number };

    return row.count;
  },

  async sumByType(filter: FilterInput): Promise<Array<{ type: "income" | "expense" | "transfer"; amount: number }>> {
    const { sql, params } = buildFilterWhere(filter);
    const rows = (await db
      .prepare(
        `SELECT t.type, SUM(t.amount_cents) AS total_cents
         FROM transactions t
         WHERE ${sql}
         GROUP BY t.type`
      )
      .all(...params)) as Array<{ type: "income" | "expense" | "transfer"; total_cents: number | null }>;

    return rows.map((row) => ({
      type: row.type,
      amount: fromCents(row.total_cents)
    }));
  },

  async findByIdForUser(id: string, userId: string) {
    const row = (await db
      .prepare(
        `SELECT
            t.id, t.user_id, t.account_id, t.category_id, t.import_batch_id, t.posted_at,
            t.description, t.normalized_description, t.amount_cents, t.currency, t.type, t.direction, t.is_internal_transfer, t.status,
            t.account, t.bank, t.external_id, t.imported_hash, t.transfer_group_id, t.transfer_peer_tx_id, t.transfer_from_account_id, t.transfer_to_account_id, t.raw_json, t.created_at, t.updated_at,
            a.name AS account_name, a.type AS account_type, a.institution AS account_institution, a.currency AS account_currency, a.parent_account_id AS account_parent_account_id,
            c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.parent_id AS category_parent_id
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = ? AND t.user_id = ?`
      )
      .get(id, userId)) as TransactionJoinedRow | undefined;

    return row ? mapWithRelations(row) : null;
  },

  async create(input: {
    userId: string;
    accountId: string;
    categoryId?: string | null;
    date: Date;
    description: string;
    normalizedDescription: string;
    amount: number;
    type: "income" | "expense" | "transfer";
    status: "posted" | "pending";
    importBatchId?: string | null;
    importedHash?: string | null;
    transferGroupId?: string | null;
    transferPeerTxId?: string | null;
    transferFromAccountId?: string | null;
    transferToAccountId?: string | null;
    direction?: TransactionDirection;
    isInternalTransfer?: boolean;
    raw?: Record<string, unknown> | null;
  }) {
    const id = createId();
    const now = nowIso();
    const categoryId = input.type === "transfer" ? null : (input.categoryId ?? null);
    const transferFromAccountId = input.type === "transfer" ? (input.transferFromAccountId ?? null) : null;
    const transferToAccountId = input.type === "transfer" ? (input.transferToAccountId ?? null) : null;
    const direction = input.direction ?? directionFromAmount(input.amount);
    const isInternalTransfer = input.type === "transfer" ? (input.isInternalTransfer ?? true) : false;

    await db.prepare(
      `INSERT INTO transactions (
         id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
         amount_cents, currency, type, direction, is_internal_transfer, status, imported_hash, transfer_group_id, transfer_peer_tx_id, transfer_from_account_id, transfer_to_account_id, raw_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BRL', ${TX_TYPE_PARAM_SQL}, ${TX_DIRECTION_PARAM_SQL}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.accountId,
      categoryId,
      input.importBatchId ?? null,
      input.date.toISOString(),
      input.description,
      input.normalizedDescription,
      toCents(input.amount),
      input.type,
      direction,
      toDbBoolean(isInternalTransfer),
      input.status,
      input.importedHash ?? null,
      input.transferGroupId ?? null,
      input.transferPeerTxId ?? null,
      transferFromAccountId,
      transferToAccountId,
      input.raw ? JSON.stringify(input.raw) : null,
      now,
      now
    );

    return this.findByIdForUser(id, input.userId);
  },

  async createMany(
    rows: Array<{
      userId: string;
      accountId: string;
      categoryId?: string | null;
      importBatchId?: string | null;
      date: Date;
      description: string;
      normalizedDescription: string;
      amount: number;
      type: "income" | "expense" | "transfer";
      status: "posted" | "pending";
      importedHash?: string | null;
      transferGroupId?: string | null;
      transferPeerTxId?: string | null;
      transferFromAccountId?: string | null;
      transferToAccountId?: string | null;
      direction?: TransactionDirection;
      isInternalTransfer?: boolean;
      raw?: Record<string, unknown> | null;
    }>
  ): Promise<{ count: number }> {
    if (rows.length === 0) {
      return { count: 0 };
    }

    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO transactions (
         id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
         amount_cents, currency, type, direction, is_internal_transfer, status, imported_hash, transfer_group_id, transfer_peer_tx_id, transfer_from_account_id, transfer_to_account_id, raw_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BRL', ${TX_TYPE_PARAM_SQL}, ${TX_DIRECTION_PARAM_SQL}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const run = db.transaction(async () => {
      let count = 0;
      for (const row of rows) {
        const categoryId = row.type === "transfer" ? null : (row.categoryId ?? null);
        const transferFromAccountId = row.type === "transfer" ? (row.transferFromAccountId ?? null) : null;
        const transferToAccountId = row.type === "transfer" ? (row.transferToAccountId ?? null) : null;
        const direction = row.direction ?? directionFromAmount(row.amount);
        const isInternalTransfer = row.type === "transfer" ? (row.isInternalTransfer ?? true) : false;
        await insert.run(
          createId(),
          row.userId,
          row.accountId,
          categoryId,
          row.importBatchId ?? null,
          row.date.toISOString(),
          row.description,
          row.normalizedDescription,
          toCents(row.amount),
          row.type,
          direction,
          toDbBoolean(isInternalTransfer),
          row.status,
          row.importedHash ?? null,
          row.transferGroupId ?? null,
          row.transferPeerTxId ?? null,
          transferFromAccountId,
          transferToAccountId,
          row.raw ? JSON.stringify(row.raw) : null,
          now,
          now
        );
        count += 1;
      }
      return count;
    });

    return { count: await run() };
  },

  async createTransferPair(input: {
    userId: string;
    fromAccountId: string;
    toAccountId: string;
    date: Date;
    description: string;
    normalizedDescription: string;
    amount: number;
    status: "posted" | "pending";
    isInternalTransfer?: boolean;
    importBatchId?: string | null;
    importedHashBase?: string | null;
    raw?: Record<string, unknown> | null;
  }): Promise<{
    created: boolean;
    reason?: "duplicate";
    transferGroupId: string | null;
    outTxId: string | null;
    inTxId: string | null;
    outImportedHash: string | null;
    inImportedHash: string | null;
  }> {
    if (input.fromAccountId === input.toAccountId) {
      throw new Error("TRANSFER_SAME_ACCOUNT");
    }

    const absoluteAmount = Math.abs(input.amount);
    if (!Number.isFinite(absoluteAmount) || absoluteAmount <= 0) {
      throw new Error("TRANSFER_INVALID_AMOUNT");
    }

    const importedHashBase = input.importedHashBase?.trim() ? input.importedHashBase.trim() : null;
    const outImportedHash = importedHashBase ? `${importedHashBase}:OUT` : null;
    const inImportedHash = importedHashBase ? `${importedHashBase}:IN` : null;

    const duplicateResult = {
      created: false as const,
      reason: "duplicate" as const,
      transferGroupId: null,
      outTxId: null,
      inTxId: null,
      outImportedHash,
      inImportedHash
    };

    try {
      return dbTransaction(async () => {
        const fromAccountExists = (await db
          .prepare(
            `SELECT id
             FROM accounts
             WHERE user_id = ? AND id = ?
             LIMIT 1`
          )
          .get(input.userId, input.fromAccountId)) as { id: string } | undefined;
        if (!fromAccountExists) {
          throw new Error("TRANSFER_FROM_ACCOUNT_NOT_FOUND");
        }

        const toAccountExists = (await db
          .prepare(
            `SELECT id
             FROM accounts
             WHERE user_id = ? AND id = ?
             LIMIT 1`
          )
          .get(input.userId, input.toAccountId)) as { id: string } | undefined;
        if (!toAccountExists) {
          throw new Error("TRANSFER_TO_ACCOUNT_NOT_FOUND");
        }

        if (outImportedHash && inImportedHash) {
          const existing = (await db
            .prepare(
              `SELECT id
               FROM transactions
               WHERE user_id = ?
                 AND imported_hash IN (?, ?)
               LIMIT 1`
            )
            .get(input.userId, outImportedHash, inImportedHash)) as { id: string } | undefined;

          if (existing) {
            return duplicateResult;
          }
        }

        const transferGroupId = createId();
        const outTxId = createId();
        const inTxId = createId();
        const now = nowIso();
        const isInternalTransfer = input.isInternalTransfer ?? true;

        const insert = db.prepare(
          `INSERT INTO transactions (
             id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
             amount_cents, currency, type, direction, is_internal_transfer, status, imported_hash, transfer_group_id, transfer_peer_tx_id, transfer_from_account_id, transfer_to_account_id, raw_json, created_at, updated_at
           ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'BRL', ${TX_TRANSFER_LITERAL_SQL}, ${TX_DIRECTION_PARAM_SQL}, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`
        );

        await insert.run(
          outTxId,
          input.userId,
          input.fromAccountId,
          input.importBatchId ?? null,
          input.date.toISOString(),
          input.description,
          input.normalizedDescription,
          toCents(-absoluteAmount),
          "out",
          toDbBoolean(isInternalTransfer),
          input.status,
          outImportedHash,
          transferGroupId,
          input.fromAccountId,
          input.toAccountId,
          input.raw
            ? JSON.stringify({
                ...input.raw,
                transferDirection: "out"
              })
            : JSON.stringify({ transferDirection: "out" }),
          now,
          now
        );

        await insert.run(
          inTxId,
          input.userId,
          input.toAccountId,
          input.importBatchId ?? null,
          input.date.toISOString(),
          input.description,
          input.normalizedDescription,
          toCents(absoluteAmount),
          "in",
          toDbBoolean(isInternalTransfer),
          input.status,
          inImportedHash,
          transferGroupId,
          input.fromAccountId,
          input.toAccountId,
          input.raw
            ? JSON.stringify({
                ...input.raw,
                transferDirection: "in"
              })
            : JSON.stringify({ transferDirection: "in" }),
          now,
          now
        );

        const updatePeer = db.prepare(
          `UPDATE transactions
           SET transfer_peer_tx_id = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
        );
        await updatePeer.run(inTxId, now, outTxId, input.userId);
        await updatePeer.run(outTxId, now, inTxId, input.userId);

        return {
          created: true,
          transferGroupId,
          outTxId,
          inTxId,
          outImportedHash,
          inImportedHash
        };
      });
    } catch (error) {
      if (
        outImportedHash &&
        inImportedHash &&
        error instanceof Error &&
        error.message.toLowerCase().includes("unique")
      ) {
        return duplicateResult;
      }
      throw error;
    }
  },

  async update(input: {
    id: string;
    userId: string;
    accountId?: string;
    categoryId?: string | null;
    date?: Date;
    description?: string;
    normalizedDescription?: string;
    amount?: number;
    type?: "income" | "expense" | "transfer";
    status?: "posted" | "pending";
    transferFromAccountId?: string | null;
    transferToAccountId?: string | null;
    direction?: TransactionDirection;
    isInternalTransfer?: boolean;
  }) {
    const existing = await this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;

    const nextDescription = input.description ?? existing.description;
    const nextNormalizedDescription = input.normalizedDescription ?? existing.normalizedDescription;
    const nextAmount = input.amount ?? existing.amount;
    const nextType =
      input.type ?? (existing.type === "transfer" ? "transfer" : nextAmount >= 0 ? "income" : "expense");
    const nextCategoryId =
      nextType === "transfer"
        ? null
        : input.categoryId !== undefined
          ? input.categoryId
          : existing.categoryId;
    const nextTransferFromAccountId =
      nextType === "transfer"
        ? input.transferFromAccountId !== undefined
          ? input.transferFromAccountId
          : existing.transferFromAccountId
        : null;
    const nextTransferToAccountId =
      nextType === "transfer"
        ? input.transferToAccountId !== undefined
          ? input.transferToAccountId
          : existing.transferToAccountId
        : null;
    const nextDirection = input.direction ?? directionFromAmount(nextAmount);
    const nextIsInternalTransfer =
      nextType === "transfer"
        ? input.isInternalTransfer !== undefined
          ? input.isInternalTransfer
          : existing.isInternalTransfer
        : false;

    await db.prepare(
      `UPDATE transactions
       SET account_id = ?, category_id = ?, posted_at = ?, description = ?, normalized_description = ?,
           amount_cents = ?, type = ${TX_TYPE_PARAM_SQL}, direction = ${TX_DIRECTION_PARAM_SQL}, is_internal_transfer = ?, status = ?, transfer_from_account_id = ?, transfer_to_account_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.accountId ?? existing.accountId,
      nextCategoryId,
      (input.date ?? existing.date).toISOString(),
      nextDescription,
      nextNormalizedDescription,
      toCents(nextAmount),
      nextType,
      nextDirection,
      toDbBoolean(nextIsInternalTransfer),
      input.status ?? existing.status,
      nextTransferFromAccountId,
      nextTransferToAccountId,
      nowIso(),
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  async deleteByIdForUser(id: string, userId: string): Promise<number> {
    const existing = (await db
      .prepare(
        `SELECT id, type, transfer_peer_tx_id, transfer_group_id
         FROM transactions
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId)) as
      | {
          id: string;
          type: "income" | "expense" | "transfer";
          transfer_peer_tx_id: string | null;
          transfer_group_id: string | null;
        }
      | undefined;

    if (!existing) {
      return 0;
    }

    const idsToDelete = new Set<string>([existing.id]);
    if (existing.type === "transfer") {
      if (existing.transfer_peer_tx_id) {
        idsToDelete.add(existing.transfer_peer_tx_id);
      }

      if (existing.transfer_group_id) {
        const groupedRows = (await db
          .prepare(
            `SELECT id
             FROM transactions
             WHERE user_id = ? AND transfer_group_id = ?`
          )
          .all(userId, existing.transfer_group_id)) as Array<{ id: string }>;

        for (const row of groupedRows) {
          idsToDelete.add(row.id);
        }
      }
    }

    const finalIds = [...idsToDelete];
    const placeholders = finalIds.map(() => "?").join(",");
    const result = await db
      .prepare(
        `DELETE FROM transactions
         WHERE user_id = ? AND id IN (${placeholders})`
      )
      .run(userId, ...finalIds);

    return result.changes;
  },

  async deleteManyByIdsForUser(ids: string[], userId: string): Promise<number> {
    if (ids.length === 0) return 0;

    const selectedIds = [...new Set(ids)];
    const selectedPlaceholders = selectedIds.map(() => "?").join(",");
    const selectedRows = (await db
      .prepare(
        `SELECT id, type, transfer_peer_tx_id, transfer_group_id
         FROM transactions
         WHERE user_id = ? AND id IN (${selectedPlaceholders})`
      )
      .all(userId, ...selectedIds)) as Array<{
      id: string;
      type: "income" | "expense" | "transfer";
      transfer_peer_tx_id: string | null;
      transfer_group_id: string | null;
    }>;

    if (selectedRows.length === 0) {
      return 0;
    }

    const idsToDelete = new Set<string>(selectedRows.map((row) => row.id));
    const transferGroupIds = new Set<string>();

    for (const row of selectedRows) {
      if (row.type !== "transfer") continue;
      if (row.transfer_peer_tx_id) {
        idsToDelete.add(row.transfer_peer_tx_id);
      }
      if (row.transfer_group_id) {
        transferGroupIds.add(row.transfer_group_id);
      }
    }

    if (transferGroupIds.size > 0) {
      const groupPlaceholders = [...transferGroupIds].map(() => "?").join(",");
      const groupedRows = (await db
        .prepare(
          `SELECT id
           FROM transactions
           WHERE user_id = ? AND transfer_group_id IN (${groupPlaceholders})`
        )
        .all(userId, ...transferGroupIds)) as Array<{ id: string }>;

      for (const row of groupedRows) {
        idsToDelete.add(row.id);
      }
    }

    const finalIds = [...idsToDelete];
    const placeholders = finalIds.map(() => "?").join(",");
    const result = await db
      .prepare(
        `DELETE FROM transactions
         WHERE user_id = ? AND id IN (${placeholders})`
      )
      .run(userId, ...finalIds);

    return result.changes;
  },

  async listForRuleReapply(userId: string, onlyUncategorized: boolean) {
    const rows = (await db
      .prepare(
        `SELECT id, description, normalized_description, amount_cents, account_id, category_id
         FROM transactions
         WHERE user_id = ?
           AND type IN ('income', 'expense')
           ${onlyUncategorized ? "AND category_id IS NULL" : ""}
         ORDER BY posted_at DESC, created_at DESC`
      )
      .all(userId)) as Array<{
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

  async bulkUpdateCategory(updates: Array<{ id: string; categoryId: string }>) {
    if (updates.length === 0) return 0;
    const stmt = db.prepare(
      `UPDATE transactions
       SET category_id = ?, updated_at = ?
       WHERE id = ?`
    );

    return dbTransaction(async () => {
      let count = 0;
      const now = nowIso();
      for (const update of updates) {
        const result = await stmt.run(update.categoryId, now, update.id);
        count += result.changes;
      }
      return count;
    });
  },

  async findImportedHashes(userId: string, hashes: string[]) {
    if (hashes.length === 0) return [];
    const placeholders = hashes.map(() => "?").join(",");
    const rows = (await db
      .prepare(
        `SELECT imported_hash
         FROM transactions
         WHERE user_id = ? AND imported_hash IN (${placeholders})`
      )
      .all(userId, ...hashes)) as Array<{ imported_hash: string | null }>;

    return rows.map((row) => row.imported_hash).filter((value): value is string => Boolean(value));
  },

  async countByAccount(userId: string, accountId: string): Promise<number> {
    const row = (await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE user_id = ? AND account_id = ?`
      )
      .get(userId, accountId)) as { count: number };

    return row.count;
  },

  async listByDateRange(userId: string, from: Date, to: Date, withCategory = false) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, account_id, category_id, import_batch_id, posted_at, description, normalized_description,
                amount_cents, currency, type, direction, is_internal_transfer, status, account, bank, external_id, imported_hash, transfer_group_id, transfer_peer_tx_id, transfer_from_account_id, transfer_to_account_id, raw_json, created_at, updated_at
         FROM transactions
         WHERE user_id = ? AND posted_at >= ? AND posted_at <= ?
         ORDER BY posted_at ASC`
      )
      .all(userId, from.toISOString(), to.toISOString())) as TransactionRow[];

    if (!withCategory) {
      return rows.map(mapBase);
    }
    return rows.map(mapBase);
  },

  async listRecentAmounts(userId: string, take: number) {
    const rows = (await db
      .prepare(
        `SELECT amount_cents
         FROM transactions
         WHERE user_id = ?
         ORDER BY posted_at DESC
         LIMIT ?`
      )
      .all(userId, take)) as Array<{ amount_cents: number }>;

    return rows.map((row) => ({ amount: fromCents(row.amount_cents) }));
  },

  async latestPostedAt(userId: string): Promise<Date | null> {
    const row = (await db
      .prepare(
        `SELECT posted_at
         FROM transactions
         WHERE user_id = ?
         ORDER BY posted_at DESC
         LIMIT 1`
      )
      .get(userId)) as { posted_at: string } | undefined;

    if (!row?.posted_at) {
      return null;
    }

    const parsed = new Date(row.posted_at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },

  async oldestPostedAt(userId: string): Promise<Date | null> {
    const row = (await db
      .prepare(
        `SELECT posted_at
         FROM transactions
         WHERE user_id = ?
         ORDER BY posted_at ASC
         LIMIT 1`
      )
      .get(userId)) as { posted_at: string } | undefined;

    if (!row?.posted_at) {
      return null;
    }

    const parsed = new Date(row.posted_at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },

  async listMetaForUser(userId: string) {
    return {
      accounts: await accountsRepo.listByUser(userId),
      categories: await categoriesRepo.listByUser(userId)
    };
  }
};



