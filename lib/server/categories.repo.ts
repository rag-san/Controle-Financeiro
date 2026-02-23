import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { nowIso } from "@/lib/server/sql";

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  tx_count?: number;
  children_count?: number;
};

function mapCategory(row: CategoryRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    parentId: row.parent_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const categoriesRepo = {
  async listByUser(userId: string, withCounts = false) {
    if (!withCounts) {
      const rows = (await db
        .prepare(
          `SELECT id, user_id, name, color, icon, parent_id, created_at, updated_at
           FROM categories
           WHERE user_id = ?
           ORDER BY parent_id ASC, name ASC`
        )
        .all(userId)) as CategoryRow[];

      return rows.map(mapCategory);
    }

    const rows = (await db
      .prepare(
        `SELECT c.id, c.user_id, c.name, c.color, c.icon, c.parent_id, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS tx_count,
                (SELECT COUNT(*) FROM categories cc WHERE cc.parent_id = c.id AND cc.user_id = c.user_id) AS children_count
         FROM categories c
         WHERE c.user_id = ?
         ORDER BY c.parent_id ASC, c.name ASC`
      )
      .all(userId)) as CategoryRow[];

    return rows.map((row) => ({
      ...mapCategory(row),
      _count: {
        transactions: row.tx_count ?? 0,
        children: row.children_count ?? 0
      }
    }));
  },

  async findByIdForUser(id: string, userId: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, name, color, icon, parent_id, created_at, updated_at
         FROM categories
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId)) as CategoryRow | undefined;

    return row ? mapCategory(row) : null;
  },

  async create(input: {
    userId: string;
    name: string;
    color?: string;
    icon?: string | null;
    parentId?: string | null;
  }) {
    const id = createId();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO categories (id, user_id, name, color, icon, parent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.userId, input.name, input.color ?? "#3b82f6", input.icon ?? null, input.parentId ?? null, now, now);

    return this.findByIdForUser(id, input.userId);
  },

  async update(input: {
    id: string;
    userId: string;
    name?: string;
    color?: string;
    icon?: string | null;
    parentId?: string | null;
  }) {
    const existing = await this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;
    const now = nowIso();

    await db.prepare(
      `UPDATE categories
       SET name = ?, color = ?, icon = ?, parent_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.name ?? existing.name,
      input.color ?? existing.color,
      input.icon !== undefined ? input.icon : existing.icon,
      input.parentId !== undefined ? input.parentId : existing.parentId,
      now,
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  async clearParentForChildren(input: { userId: string; parentId: string }) {
    await db.prepare(
      `UPDATE categories
       SET parent_id = NULL, updated_at = ?
       WHERE user_id = ? AND parent_id = ?`
    ).run(nowIso(), input.userId, input.parentId);
  },

  async delete(input: { id: string; userId: string }): Promise<number> {
    const result = await db
      .prepare(
        `DELETE FROM categories
         WHERE id = ? AND user_id = ?`
      )
      .run(input.id, input.userId);

    return result.changes;
  }
};



