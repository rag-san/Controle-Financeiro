import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { nowIso } from "@/lib/server/sql";

type ImportEventPhase = "parse" | "mapping" | "commit";

function clampCounter(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  return Math.trunc(value);
}

export const importObservabilityRepo = {
  async record(input: {
    userId: string;
    sourceType?: string;
    event: string;
    phase: ImportEventPhase;
    errorCode?: string;
    totalRows?: number;
    validRows?: number;
    ignoredRows?: number;
    errorRows?: number;
    imported?: number;
    skipped?: number;
    duplicates?: number;
    invalidRows?: number;
    transferCreated?: number;
    cardPaymentDetected?: number;
    cardPaymentNotConverted?: number;
  }): Promise<void> {
    const id = createId();
    const createdAt = nowIso();

    await db.prepare(
      `INSERT INTO import_events (
         id, user_id, source_type, event, phase, error_code,
         total_rows, valid_rows, ignored_rows, error_rows,
         imported, skipped, duplicates, invalid_rows,
         transfer_created, card_payment_detected, card_payment_not_converted,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.sourceType ?? "unknown",
      input.event,
      input.phase,
      input.errorCode ?? null,
      clampCounter(input.totalRows),
      clampCounter(input.validRows),
      clampCounter(input.ignoredRows),
      clampCounter(input.errorRows),
      clampCounter(input.imported),
      clampCounter(input.skipped),
      clampCounter(input.duplicates),
      clampCounter(input.invalidRows),
      clampCounter(input.transferCreated),
      clampCounter(input.cardPaymentDetected),
      clampCounter(input.cardPaymentNotConverted),
      createdAt
    );
  },

  async summarizeBySource(input: {
    userId: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{
    sourceType: string;
    phase: ImportEventPhase;
    events: number;
    success: number;
    errors: number;
    duplicates: number;
    transferCreated: number;
    cardPaymentsDetected: number;
    cardPaymentsNotConverted: number;
  }>> {
    const clauses = ["user_id = ?"];
    const params: unknown[] = [input.userId];

    if (input.from) {
      clauses.push("created_at >= ?");
      params.push(input.from.toISOString());
    }
    if (input.to) {
      clauses.push("created_at <= ?");
      params.push(input.to.toISOString());
    }

    const where = clauses.join(" AND ");
    const rows = (await db
      .prepare(
        `SELECT
            source_type,
            phase,
            COUNT(*) AS events,
            SUM(CASE WHEN error_code IS NULL THEN 1 ELSE 0 END) AS success,
            SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors,
            COALESCE(SUM(duplicates), 0) AS duplicates,
            COALESCE(SUM(transfer_created), 0) AS transfer_created,
            COALESCE(SUM(card_payment_detected), 0) AS card_payment_detected,
            COALESCE(SUM(card_payment_not_converted), 0) AS card_payment_not_converted
         FROM import_events
         WHERE ${where}
         GROUP BY source_type, phase
         ORDER BY source_type ASC, phase ASC`
      )
      .all(...params)) as Array<{
      source_type: string;
      phase: ImportEventPhase;
      events: number;
      success: number;
      errors: number;
      duplicates: number;
      transfer_created: number;
      card_payment_detected: number;
      card_payment_not_converted: number;
    }>;

    return rows.map((row) => ({
      sourceType: row.source_type,
      phase: row.phase,
      events: row.events,
      success: row.success,
      errors: row.errors,
      duplicates: row.duplicates,
      transferCreated: row.transfer_created,
      cardPaymentsDetected: row.card_payment_detected,
      cardPaymentsNotConverted: row.card_payment_not_converted
    }));
  },

  async recentErrors(input: {
    userId: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<Array<{
    sourceType: string;
    phase: ImportEventPhase;
    errorCode: string;
    count: number;
    lastSeenAt: string;
  }>> {
    const clauses = ["user_id = ?", "error_code IS NOT NULL"];
    const params: unknown[] = [input.userId];

    if (input.from) {
      clauses.push("created_at >= ?");
      params.push(input.from.toISOString());
    }
    if (input.to) {
      clauses.push("created_at <= ?");
      params.push(input.to.toISOString());
    }

    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const where = clauses.join(" AND ");

    const rows = (await db
      .prepare(
        `SELECT
            source_type,
            phase,
            error_code,
            COUNT(*) AS count,
            MAX(created_at) AS last_seen_at
         FROM import_events
         WHERE ${where}
         GROUP BY source_type, phase, error_code
         ORDER BY count DESC, last_seen_at DESC
         LIMIT ?`
      )
      .all(...params, limit)) as Array<{
      source_type: string;
      phase: ImportEventPhase;
      error_code: string;
      count: number;
      last_seen_at: string;
    }>;

    return rows.map((row) => ({
      sourceType: row.source_type,
      phase: row.phase,
      errorCode: row.error_code,
      count: row.count,
      lastSeenAt: row.last_seen_at
    }));
  }
};
