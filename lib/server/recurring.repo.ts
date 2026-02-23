import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { fromCents, nowIso, toCents } from "@/lib/server/sql";

type RecurringRow = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  due_day: number;
  category_id: string | null;
  status: "active" | "inactive";
  last_paid_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapItem(row: RecurringRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    amount: fromCents(row.amount_cents),
    dueDay: row.due_day,
    categoryId: row.category_id,
    status: row.status,
    lastPaidAt: row.last_paid_at ? new Date(row.last_paid_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const recurringRepo = {
  async listByUser(userId: string, includeCategory = false) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, name, amount_cents, due_day, category_id, status, last_paid_at, created_at, updated_at
         FROM recurring_items
         WHERE user_id = ?
         ORDER BY status ASC, due_day ASC, name ASC`
      )
      .all(userId)) as RecurringRow[];

    const base = rows.map(mapItem);
    if (!includeCategory) return base;

    const categories = await categoriesRepo.listByUser(userId);
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    return base.map((item) => ({
      ...item,
      category: item.categoryId ? categoryById.get(item.categoryId) ?? null : null
    }));
  },

  async findByIdForUser(id: string, userId: string, includeCategory = false) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, name, amount_cents, due_day, category_id, status, last_paid_at, created_at, updated_at
         FROM recurring_items
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId)) as RecurringRow | undefined;

    if (!row) return null;
    const base = mapItem(row);
    if (!includeCategory) return base;
    const category = base.categoryId ? await categoriesRepo.findByIdForUser(base.categoryId, userId) : null;
    return { ...base, category };
  },

  async create(input: {
    userId: string;
    name: string;
    amount: number;
    dueDay: number;
    categoryId?: string | null;
    status: "active" | "inactive";
    lastPaidAt?: Date | null;
  }) {
    const id = createId();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO recurring_items (
         id, user_id, name, amount_cents, due_day, category_id, status, last_paid_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.name,
      toCents(input.amount),
      input.dueDay,
      input.categoryId ?? null,
      input.status,
      input.lastPaidAt ? input.lastPaidAt.toISOString() : null,
      now,
      now
    );

    return this.findByIdForUser(id, input.userId, true);
  },

  async update(input: {
    id: string;
    userId: string;
    name?: string;
    amount?: number;
    dueDay?: number;
    categoryId?: string | null;
    status?: "active" | "inactive";
    lastPaidAt?: Date | null;
  }) {
    const existing = await this.findByIdForUser(input.id, input.userId, false);
    if (!existing) return null;

    await db.prepare(
      `UPDATE recurring_items
       SET name = ?, amount_cents = ?, due_day = ?, category_id = ?, status = ?, last_paid_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.name ?? existing.name,
      toCents(input.amount ?? existing.amount),
      input.dueDay ?? existing.dueDay,
      input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      input.status ?? existing.status,
      input.lastPaidAt !== undefined ? (input.lastPaidAt ? input.lastPaidAt.toISOString() : null) : existing.lastPaidAt ? existing.lastPaidAt.toISOString() : null,
      nowIso(),
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId, true);
  },

  async delete(input: { id: string; userId: string }): Promise<number> {
    const result = await db
      .prepare(
        `DELETE FROM recurring_items
         WHERE id = ? AND user_id = ?`
      )
      .run(input.id, input.userId);
    return result.changes;
  }
};



