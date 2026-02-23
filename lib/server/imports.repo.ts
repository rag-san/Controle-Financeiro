import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { nowIso } from "@/lib/server/sql";

type ImportBatchRow = {
  id: string;
  user_id: string;
  source: "csv" | "ofx" | "pdf" | "manual";
  file_name: string;
  mapping_json: string | null;
  total_imported: number;
  total_skipped: number;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

function mapBatch(row: ImportBatchRow) {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source,
    fileName: row.file_name,
    mapping: row.mapping_json ? JSON.parse(row.mapping_json) : null,
    totalImported: row.total_imported,
    totalSkipped: row.total_skipped,
    importedAt: new Date(row.imported_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export const importsRepo = {
  async listRecentByUser(userId: string, take = 30) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, source, file_name, mapping_json, total_imported, total_skipped, imported_at, created_at, updated_at
         FROM import_batches
         WHERE user_id = ?
         ORDER BY imported_at DESC
         LIMIT ?`
      )
      .all(userId, take)) as ImportBatchRow[];

    return rows.map(mapBatch);
  },

  async createBatch(input: {
    userId: string;
    sourceType: "csv" | "ofx" | "pdf" | "manual";
    fileName: string;
    mapping?: Record<string, unknown> | null;
  }) {
    const id = createId();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO import_batches (
         id, user_id, source, file_name, mapping_json, total_imported, total_skipped, imported_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
    ).run(id, input.userId, input.sourceType, input.fileName, input.mapping ? JSON.stringify(input.mapping) : null, now, now, now);

    return this.findById(id);
  },

  async findById(id: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, source, file_name, mapping_json, total_imported, total_skipped, imported_at, created_at, updated_at
         FROM import_batches
         WHERE id = ?`
      )
      .get(id)) as ImportBatchRow | undefined;
    return row ? mapBatch(row) : null;
  },

  async updateBatchTotals(input: { id: string; totalImported: number; totalSkipped: number }) {
    await db.prepare(
      `UPDATE import_batches
       SET total_imported = ?, total_skipped = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.totalImported, input.totalSkipped, nowIso(), input.id);
  },

  async insertImportItem(input: { id: string; userId: string; batchId: string; txId: string }) {
    await db.prepare(
      `INSERT OR IGNORE INTO import_items (id, user_id, batch_id, tx_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(input.id, input.userId, input.batchId, input.txId, nowIso());
  }
};



