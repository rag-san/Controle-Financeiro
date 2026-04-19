import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { nowIso } from "@/lib/server/sql";

type SnapshotRow = {
  id: string;
  user_id: string;
  metric_key: string;
  period_key: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

function parseSnapshotTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export const officialMetricSnapshotsRepo = {
  async find(input: { userId: string; metricKey: string; periodKey: string }) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, metric_key, period_key, payload_json, created_at, updated_at
         FROM official_metric_snapshots
         WHERE user_id = ? AND metric_key = ? AND period_key = ?
         LIMIT 1`
      )
      .get(input.userId, input.metricKey, input.periodKey)) as SnapshotRow | undefined;

    if (!row) return null;
    try {
      return {
        id: row.id,
        userId: row.user_id,
        metricKey: row.metric_key,
        periodKey: row.period_key,
        payload: JSON.parse(row.payload_json) as unknown,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdAtDate: parseSnapshotTimestamp(row.created_at),
        updatedAtDate: parseSnapshotTimestamp(row.updated_at)
      };
    } catch {
      return null;
    }
  },

  async upsert(input: {
    userId: string;
    metricKey: string;
    periodKey: string;
    payload: unknown;
  }): Promise<void> {
    const existing = (await db
      .prepare(
        `SELECT id
         FROM official_metric_snapshots
         WHERE user_id = ? AND metric_key = ? AND period_key = ?
         LIMIT 1`
      )
      .get(input.userId, input.metricKey, input.periodKey)) as { id: string } | undefined;
    const now = nowIso();
    const payloadJson = JSON.stringify(input.payload);

    if (existing) {
      await db.prepare(
        `UPDATE official_metric_snapshots
         SET payload_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(payloadJson, now, existing.id);
      return;
    }

    await db.prepare(
      `INSERT INTO official_metric_snapshots (
         id, user_id, metric_key, period_key, payload_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(createId(), input.userId, input.metricKey, input.periodKey, payloadJson, now, now);
  },

  async deleteByUser(userId: string): Promise<void> {
    await db.prepare(
      `DELETE FROM official_metric_snapshots
       WHERE user_id = ?`
    ).run(userId);
  },

  async latestSourceMutationAt(userId: string): Promise<Date | null> {
    const row = (await db
      .prepare(
        `SELECT MAX(updated_at) AS updated_at
         FROM (
           SELECT MAX(updated_at) AS updated_at FROM accounts WHERE user_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS updated_at FROM categories WHERE user_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS updated_at FROM credit_card_accounts WHERE user_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS updated_at FROM transactions WHERE user_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS updated_at FROM ledger_entries WHERE user_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS updated_at FROM net_worth_entries WHERE user_id = ?
         ) source_updates`
      )
      .get(userId, userId, userId, userId, userId, userId)) as { updated_at?: string | null } | undefined;

    return parseSnapshotTimestamp(row?.updated_at);
  }
};
