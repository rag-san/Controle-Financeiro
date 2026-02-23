import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { fromCents, nowIso, toCents } from "@/lib/server/sql";

type NetWorthRow = {
  id: string;
  user_id: string;
  type: "asset" | "debt";
  name: string;
  value_cents: number;
  date_iso: string;
  group_name: string | null;
  created_at: string;
  updated_at: string;
};

function mapEntry(row: NetWorthRow) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    name: row.name,
    value: fromCents(row.value_cents),
    date: new Date(row.date_iso),
    group: row.group_name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const netWorthRepo = {
  async listByUser(userId: string) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, type, name, value_cents, date_iso, group_name, created_at, updated_at
         FROM net_worth_entries
         WHERE user_id = ?
         ORDER BY date_iso ASC, created_at ASC`
      )
      .all(userId)) as NetWorthRow[];

    return rows.map(mapEntry);
  },

  async findByIdForUser(id: string, userId: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, type, name, value_cents, date_iso, group_name, created_at, updated_at
         FROM net_worth_entries
         WHERE id = ? AND user_id = ?`
      )
      .get(id, userId)) as NetWorthRow | undefined;
    return row ? mapEntry(row) : null;
  },

  async create(input: {
    userId: string;
    type: "asset" | "debt";
    name: string;
    value: number;
    date: Date;
    group?: string | null;
  }) {
    const id = createId();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO net_worth_entries (
         id, user_id, type, name, value_cents, date_iso, group_name, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.userId, input.type, input.name, toCents(input.value), input.date.toISOString(), input.group ?? null, now, now);

    return this.findByIdForUser(id, input.userId);
  },

  async update(input: {
    id: string;
    userId: string;
    type?: "asset" | "debt";
    name?: string;
    value?: number;
    date?: Date;
    group?: string | null;
  }) {
    const existing = await this.findByIdForUser(input.id, input.userId);
    if (!existing) return null;

    await db.prepare(
      `UPDATE net_worth_entries
       SET type = ?, name = ?, value_cents = ?, date_iso = ?, group_name = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.type ?? existing.type,
      input.name ?? existing.name,
      toCents(input.value ?? existing.value),
      (input.date ?? existing.date).toISOString(),
      input.group !== undefined ? input.group : existing.group,
      nowIso(),
      input.id,
      input.userId
    );

    return this.findByIdForUser(input.id, input.userId);
  },

  async delete(input: { id: string; userId: string }): Promise<number> {
    const result = await db
      .prepare(
        `DELETE FROM net_worth_entries
         WHERE id = ? AND user_id = ?`
      )
      .run(input.id, input.userId);
    return result.changes;
  },

  async latestDate(userId: string): Promise<Date | null> {
    const row = (await db
      .prepare(
        `SELECT date_iso
         FROM net_worth_entries
         WHERE user_id = ?
         ORDER BY date_iso DESC, created_at DESC
         LIMIT 1`
      )
      .get(userId)) as { date_iso: string } | undefined;
    return row ? new Date(row.date_iso) : null;
  },

  async sumByTypeAtDate(userId: string, date: Date) {
    const rows = (await db
      .prepare(
        `SELECT type, SUM(value_cents) as total_cents
         FROM net_worth_entries
         WHERE user_id = ? AND date_iso = ?
         GROUP BY type`
      )
      .all(userId, date.toISOString())) as Array<{ type: "asset" | "debt"; total_cents: number | null }>;

    return rows.map((row) => ({
      type: row.type,
      value: fromCents(row.total_cents)
    }));
  }
};
