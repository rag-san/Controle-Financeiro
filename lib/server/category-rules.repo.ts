import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { boolToInt, fromCents, intToBool, nowIso, toCents } from "@/lib/server/sql";

type RuleRow = {
  id: string;
  user_id: string;
  name: string;
  priority: number;
  enabled: number;
  match_type: "contains" | "regex";
  pattern: string;
  account_id: string | null;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  category_id: string;
  created_at: string;
  updated_at: string;
};

function mapRule(row: RuleRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    priority: row.priority,
    enabled: intToBool(row.enabled),
    matchType: row.match_type,
    pattern: row.pattern,
    accountId: row.account_id,
    minAmount: row.min_amount_cents !== null ? fromCents(row.min_amount_cents) : null,
    maxAmount: row.max_amount_cents !== null ? fromCents(row.max_amount_cents) : null,
    categoryId: row.category_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const categoryRulesRepo = {
  async listByUser(userId: string, includeRelations = false) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, name, priority, enabled, match_type, pattern, account_id,
                min_amount_cents, max_amount_cents, category_id, created_at, updated_at
         FROM category_rules
         WHERE user_id = ?
         ORDER BY priority ASC, created_at ASC`
      )
      .all(userId)) as RuleRow[];

    const base = rows.map(mapRule);
    if (!includeRelations) return base;

    const categories = await categoriesRepo.listByUser(userId);
    const accounts = await accountsRepo.listByUser(userId);
    const categoryById = new Map(categories.map((item) => [item.id, item]));
    const accountById = new Map(accounts.map((item) => [item.id, item]));

    return base.map((rule) => ({
      ...rule,
      category: categoryById.get(rule.categoryId) ?? null,
      account: rule.accountId ? accountById.get(rule.accountId) ?? null : null
    }));
  },

  async listActiveByUser(userId: string) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, name, priority, enabled, match_type, pattern, account_id,
                min_amount_cents, max_amount_cents, category_id, created_at, updated_at
         FROM category_rules
         WHERE user_id = ? AND enabled = 1
         ORDER BY priority ASC, created_at ASC`
      )
      .all(userId)) as RuleRow[];
    return rows.map(mapRule);
  },

  async findByIdForUser(id: string, userId: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, name, priority, enabled, match_type, pattern, account_id,
                min_amount_cents, max_amount_cents, category_id, created_at, updated_at
         FROM category_rules
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId)) as RuleRow | undefined;
    return row ? mapRule(row) : null;
  },

  async create(input: {
    userId: string;
    name: string;
    priority: number;
    enabled: boolean;
    matchType: "contains" | "regex";
    pattern: string;
    accountId?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    categoryId: string;
  }) {
    const id = createId();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO category_rules (
         id, user_id, name, priority, enabled, match_type, pattern, account_id,
         min_amount_cents, max_amount_cents, category_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.name,
      input.priority,
      boolToInt(input.enabled),
      input.matchType,
      input.pattern,
      input.accountId ?? null,
      input.minAmount !== undefined && input.minAmount !== null ? toCents(input.minAmount) : null,
      input.maxAmount !== undefined && input.maxAmount !== null ? toCents(input.maxAmount) : null,
      input.categoryId,
      now,
      now
    );

    return this.findByIdForUser(id, input.userId);
  },

  async update(input: {
    id: string;
    userId: string;
    name?: string;
    priority?: number;
    enabled?: boolean;
    matchType?: "contains" | "regex";
    pattern?: string;
    accountId?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    categoryId?: string;
  }) {
    const existing = await this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;

    await db.prepare(
      `UPDATE category_rules
       SET name = ?, priority = ?, enabled = ?, match_type = ?, pattern = ?, account_id = ?,
           min_amount_cents = ?, max_amount_cents = ?, category_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.name ?? existing.name,
      input.priority ?? existing.priority,
      boolToInt(input.enabled ?? existing.enabled),
      input.matchType ?? existing.matchType,
      input.pattern ?? existing.pattern,
      input.accountId !== undefined ? input.accountId : existing.accountId,
      input.minAmount !== undefined ? (input.minAmount === null ? null : toCents(input.minAmount)) : existing.minAmount === null ? null : toCents(existing.minAmount),
      input.maxAmount !== undefined ? (input.maxAmount === null ? null : toCents(input.maxAmount)) : existing.maxAmount === null ? null : toCents(existing.maxAmount),
      input.categoryId ?? existing.categoryId,
      nowIso(),
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  async delete(input: { id: string; userId: string }): Promise<number> {
    const result = await db
      .prepare(
        `DELETE FROM category_rules
         WHERE id = ? AND user_id = ?`
      )
      .run(input.id, input.userId);
    return result.changes;
  }
};



