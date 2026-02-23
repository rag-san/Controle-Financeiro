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

export const officialMetricSnapshotsRepo = {
  find(input: { userId: string; metricKey: string; periodKey: string }) {
    const row = db
      .prepare(
        `SELECT id, user_id, metric_key, period_key, payload_json, created_at, updated_at
         FROM official_metric_snapshots
         WHERE user_id = ? AND metric_key = ? AND period_key = ?
         LIMIT 1`
      )
      .get(input.userId, input.metricKey, input.periodKey) as SnapshotRow | undefined;

    if (!row) return null;
    try {
      return {
        id: row.id,
        userId: row.user_id,
        metricKey: row.metric_key,
        periodKey: row.period_key,
        payload: JSON.parse(row.payload_json) as unknown,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch {
      return null;
    }
  },

  upsert(input: {
    userId: string;
    metricKey: string;
    periodKey: string;
    payload: unknown;
  }): void {
    const existing = db
      .prepare(
        `SELECT id
         FROM official_metric_snapshots
         WHERE user_id = ? AND metric_key = ? AND period_key = ?
         LIMIT 1`
      )
      .get(input.userId, input.metricKey, input.periodKey) as { id: string } | undefined;
    const now = nowIso();
    const payloadJson = JSON.stringify(input.payload);

    if (existing) {
      db.prepare(
        `UPDATE official_metric_snapshots
         SET payload_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(payloadJson, now, existing.id);
      return;
    }

    db.prepare(
      `INSERT INTO official_metric_snapshots (
         id, user_id, metric_key, period_key, payload_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(createId(), input.userId, input.metricKey, input.periodKey, payloadJson, now, now);
  }
};
