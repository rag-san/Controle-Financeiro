import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { type LedgerDirection, type LedgerEntryType } from "@/lib/ledger/normalization";
import { nowIso } from "@/lib/server/sql";

type ImportSourceKind = "BANK_STATEMENT" | "CC_STATEMENT";
type ReconciliationStatus = "matched" | "unmatched" | "suggested";

type InstitutionRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

type CreditCardAccountRow = {
  id: string;
  user_id: string;
  institution_id: string | null;
  name: string;
  currency: string;
  closing_day: number | null;
  due_day: number | null;
  default_payment_account_id: string | null;
  created_at: string;
  updated_at: string;
};

type ImportSourceRow = {
  id: string;
  user_id: string;
  institution_id: string | null;
  kind: ImportSourceKind;
  filename: string;
  file_hash: string;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

type LedgerEntryRow = {
  id: string;
  user_id: string;
  posted_at: string;
  amount_cents: number;
  direction: LedgerDirection | null;
  type: LedgerEntryType;
  description_normalized: string;
  merchant_normalized: string | null;
  account_id: string | null;
  credit_card_account_id: string | null;
  category_id: string | null;
  import_source_id: string | null;
  raw_transaction_id: string | null;
  external_ref: string | null;
  fingerprint: string;
  transfer_group_id: string | null;
  reconciliation_status: ReconciliationStatus;
  transfer_fee_cents: number;
  created_at: string;
  updated_at: string;
};

type TransferSuggestionRow = {
  id: string;
  user_id: string;
  out_entry_id: string;
  in_entry_id: string;
  score: number | string;
  status: "suggested" | "confirmed" | "rejected";
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

function mapInstitution(row: InstitutionRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapCreditCardAccount(row: CreditCardAccountRow) {
  return {
    id: row.id,
    userId: row.user_id,
    institutionId: row.institution_id,
    name: row.name,
    currency: row.currency,
    closingDay: row.closing_day,
    dueDay: row.due_day,
    defaultPaymentAccountId: row.default_payment_account_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapImportSource(row: ImportSourceRow) {
  return {
    id: row.id,
    userId: row.user_id,
    institutionId: row.institution_id,
    kind: row.kind,
    filename: row.filename,
    fileHash: row.file_hash,
    importedAt: new Date(row.imported_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapLedgerEntry(row: LedgerEntryRow) {
  return {
    id: row.id,
    userId: row.user_id,
    postedAt: new Date(row.posted_at),
    amount: Number((row.amount_cents / 100).toFixed(2)),
    amountCents: row.amount_cents,
    direction: row.direction,
    type: row.type,
    descriptionNormalized: row.description_normalized,
    merchantNormalized: row.merchant_normalized,
    accountId: row.account_id,
    creditCardAccountId: row.credit_card_account_id,
    categoryId: row.category_id,
    importSourceId: row.import_source_id,
    rawTransactionId: row.raw_transaction_id,
    externalRef: row.external_ref,
    fingerprint: row.fingerprint,
    transferGroupId: row.transfer_group_id,
    reconciliationStatus: row.reconciliation_status,
    transferFee: Number((row.transfer_fee_cents / 100).toFixed(2)),
    transferFeeCents: row.transfer_fee_cents,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapTransferSuggestion(row: TransferSuggestionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    outEntryId: row.out_entry_id,
    inEntryId: row.in_entry_id,
    score: Number(row.score),
    status: row.status,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function toCents(value: number): number {
  return Math.round(Math.abs(value) * 100);
}

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function buildDateFilters(input?: { from?: Date; to?: Date }): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (input?.from) {
    clauses.push("posted_at >= ?");
    params.push(input.from.toISOString());
  }

  if (input?.to) {
    clauses.push("posted_at <= ?");
    params.push(input.to.toISOString());
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "",
    params
  };
}

export const ledgerRepo = {
  async findOrCreateInstitution(input: { name: string; slug?: string }) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("LEDGER_INVALID_INSTITUTION_NAME");
    }

    const slug = normalizeSlug(input.slug?.trim() || name);
    if (!slug) {
      throw new Error("LEDGER_INVALID_INSTITUTION_SLUG");
    }

    const existing = (await db
      .prepare(
        `SELECT id, name, slug, created_at, updated_at
         FROM institutions
         WHERE slug = ?
         LIMIT 1`
      )
      .get(slug)) as InstitutionRow | undefined;

    if (existing) {
      return mapInstitution(existing);
    }

    const id = createId();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO institutions (id, name, slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (slug) DO NOTHING`
    ).run(id, name, slug, now, now);

    const row = (await db
      .prepare(
        `SELECT id, name, slug, created_at, updated_at
         FROM institutions
         WHERE slug = ?
         LIMIT 1`
      )
      .get(slug)) as InstitutionRow | undefined;

    if (!row) {
      throw new Error("LEDGER_INSTITUTION_CREATE_FAILED");
    }

    return mapInstitution(row);
  },

  async findCreditCardAccountById(userId: string, id: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, institution_id, name, currency, closing_day, due_day, default_payment_account_id, created_at, updated_at
         FROM credit_card_accounts
         WHERE user_id = ? AND id = ?
         LIMIT 1`
      )
      .get(userId, id)) as CreditCardAccountRow | undefined;

    return row ? mapCreditCardAccount(row) : null;
  },

  async listCreditCardAccounts(userId: string) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, institution_id, name, currency, closing_day, due_day, default_payment_account_id, created_at, updated_at
         FROM credit_card_accounts
         WHERE user_id = ?
         ORDER BY name ASC`
      )
      .all(userId)) as CreditCardAccountRow[];

    return rows.map(mapCreditCardAccount);
  },

  async createCreditCardAccount(input: {
    userId: string;
    institutionId?: string | null;
    name: string;
    currency?: string;
    closingDay?: number | null;
    dueDay?: number | null;
    defaultPaymentAccountId?: string | null;
  }) {
    const id = createId();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO credit_card_accounts (
         id, user_id, institution_id, name, currency, closing_day, due_day, default_payment_account_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.institutionId ?? null,
      input.name.trim(),
      (input.currency ?? "BRL").toUpperCase(),
      input.closingDay ?? null,
      input.dueDay ?? null,
      input.defaultPaymentAccountId ?? null,
      now,
      now
    );

    return this.findCreditCardAccountById(input.userId, id);
  },

  async upsertImportSource(input: {
    userId: string;
    institutionId?: string | null;
    kind: ImportSourceKind;
    filename: string;
    fileHash: string;
  }) {
    const now = nowIso();
    const id = createId();
    const insert = await db.prepare(
      `INSERT INTO import_sources (
         id, user_id, institution_id, kind, filename, file_hash, imported_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, file_hash) DO NOTHING`
    ).run(
      id,
      input.userId,
      input.institutionId ?? null,
      input.kind,
      input.filename,
      input.fileHash,
      now,
      now,
      now
    );

    const row = (await db
      .prepare(
        `SELECT id, user_id, institution_id, kind, filename, file_hash, imported_at, created_at, updated_at
         FROM import_sources
         WHERE user_id = ? AND file_hash = ?
         LIMIT 1`
      )
      .get(input.userId, input.fileHash)) as ImportSourceRow | undefined;

    if (!row) {
      throw new Error("LEDGER_IMPORT_SOURCE_NOT_FOUND");
    }

    return {
      source: mapImportSource(row),
      duplicate: insert.changes === 0
    };
  },

  async insertRawTransaction(input: {
    importSourceId: string;
    rawExternalId?: string | null;
    postedAt: Date;
    amount: number;
    direction: LedgerDirection;
    descriptionRaw: string;
    meta?: Record<string, unknown> | null;
  }) {
    const id = createId();
    await db.prepare(
      `INSERT INTO transaction_raw (
         id, import_source_id, raw_external_id, posted_at, amount_cents, direction, description_raw, meta_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.importSourceId,
      input.rawExternalId?.trim() || null,
      input.postedAt.toISOString(),
      toCents(input.amount),
      input.direction,
      input.descriptionRaw,
      input.meta ? JSON.stringify(input.meta) : null,
      nowIso()
    );

    return id;
  },

  async upsertLedgerEntry(input: {
    userId: string;
    postedAt: Date;
    amount: number;
    direction?: LedgerDirection | null;
    type: LedgerEntryType;
    descriptionNormalized: string;
    merchantNormalized?: string | null;
    accountId?: string | null;
    creditCardAccountId?: string | null;
    categoryId?: string | null;
    importSourceId?: string | null;
    rawTransactionId?: string | null;
    externalRef?: string | null;
    fingerprint: string;
    transferGroupId?: string | null;
    reconciliationStatus?: ReconciliationStatus;
    transferFee?: number;
  }): Promise<{ entry: ReturnType<typeof mapLedgerEntry>; created: boolean }> {
    const now = nowIso();
    const amountCents = toCents(input.amount);
    const transferFeeCents = toCents(input.transferFee ?? 0);

    const inserted = await db.query<LedgerEntryRow>(
      `INSERT INTO ledger_entries (
         id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
         account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
         fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, fingerprint) DO NOTHING
       RETURNING id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
                 account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
                 fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at`,
      [
        createId(),
        input.userId,
        input.postedAt.toISOString(),
        amountCents,
        input.direction ?? null,
        input.type,
        input.descriptionNormalized,
        input.merchantNormalized ?? null,
        input.accountId ?? null,
        input.creditCardAccountId ?? null,
        input.categoryId ?? null,
        input.importSourceId ?? null,
        input.rawTransactionId ?? null,
        input.externalRef ?? null,
        input.fingerprint,
        input.transferGroupId ?? null,
        input.reconciliationStatus ?? "unmatched",
        transferFeeCents,
        now,
        now
      ]
    );

    if (inserted.rowCount > 0 && inserted.rows[0]) {
      return {
        entry: mapLedgerEntry(inserted.rows[0]),
        created: true
      };
    }

    const existing = (await db
      .prepare(
        `SELECT id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
                account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
                fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at
         FROM ledger_entries
         WHERE user_id = ? AND fingerprint = ?
         LIMIT 1`
      )
      .get(input.userId, input.fingerprint)) as LedgerEntryRow | undefined;

    if (!existing) {
      throw new Error("LEDGER_ENTRY_UPSERT_FAILED");
    }

    return {
      entry: mapLedgerEntry(existing),
      created: false
    };
  },

  async findLedgerEntryById(userId: string, entryId: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
                account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
                fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at
         FROM ledger_entries
         WHERE user_id = ? AND id = ?
         LIMIT 1`
      )
      .get(userId, entryId)) as LedgerEntryRow | undefined;

    return row ? mapLedgerEntry(row) : null;
  },

  async findLedgerEntryByExternalRef(userId: string, externalRef: string) {
    const normalized = externalRef.trim();
    if (!normalized) return null;

    const row = (await db
      .prepare(
        `SELECT id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
                account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
                fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at
         FROM ledger_entries
         WHERE user_id = ? AND external_ref = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId, normalized)) as LedgerEntryRow | undefined;

    return row ? mapLedgerEntry(row) : null;
  },

  async listLedgerEntriesForTransferMatcher(input: { userId: string; from?: Date; to?: Date }) {
    const dateFilter = buildDateFilters({ from: input.from, to: input.to });
    const rows = (await db
      .prepare(
        `SELECT
            le.id,
            le.user_id,
            le.posted_at,
            le.amount_cents,
            le.direction,
            le.type,
            le.description_normalized,
            le.merchant_normalized,
            le.account_id,
            le.credit_card_account_id,
            le.category_id,
            le.import_source_id,
            le.raw_transaction_id,
            le.external_ref,
            le.fingerprint,
            le.transfer_group_id,
            le.reconciliation_status,
            le.transfer_fee_cents,
            le.created_at,
            le.updated_at
         FROM ledger_entries le
         WHERE le.user_id = ?
           AND le.type IN ('income', 'expense')
           AND le.account_id IS NOT NULL
           AND le.transfer_group_id IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM reconciliation_denials rd
             WHERE rd.user_id = le.user_id
               AND rd.entry_id = le.id
           )
           ${dateFilter.sql}
         ORDER BY le.posted_at ASC, le.created_at ASC`
      )
      .all(input.userId, ...dateFilter.params)) as LedgerEntryRow[];

    return rows.map(mapLedgerEntry);
  },

  async markTransferMatched(input: {
    userId: string;
    outEntryId: string;
    inEntryId: string;
    transferGroupId: string;
    descriptionOut: string;
    descriptionIn: string;
    transferFee?: number;
  }) {
    const now = nowIso();
    const transferFeeCents = toCents(input.transferFee ?? 0);

    await db.prepare(
      `UPDATE ledger_entries
       SET type = 'transfer',
           transfer_group_id = ?,
           description_normalized = ?,
           reconciliation_status = 'matched',
           transfer_fee_cents = ?,
           updated_at = ?
       WHERE user_id = ? AND id = ?`
    ).run(input.transferGroupId, input.descriptionOut, transferFeeCents, now, input.userId, input.outEntryId);

    await db.prepare(
      `UPDATE ledger_entries
       SET type = 'transfer',
           transfer_group_id = ?,
           description_normalized = ?,
           reconciliation_status = 'matched',
           transfer_fee_cents = ?,
           updated_at = ?
       WHERE user_id = ? AND id = ?`
    ).run(input.transferGroupId, input.descriptionIn, transferFeeCents, now, input.userId, input.inEntryId);
  },

  async markEntriesSuggested(input: { userId: string; entryIds: string[] }) {
    if (input.entryIds.length === 0) return;
    const placeholders = input.entryIds.map(() => "?").join(",");
    await db.prepare(
      `UPDATE ledger_entries
       SET reconciliation_status = 'suggested',
           updated_at = ?
       WHERE user_id = ? AND id IN (${placeholders}) AND reconciliation_status <> 'matched'`
    ).run(nowIso(), input.userId, ...input.entryIds);
  },

  async markEntriesUnmatched(input: { userId: string; entryIds: string[] }) {
    if (input.entryIds.length === 0) return;
    const placeholders = input.entryIds.map(() => "?").join(",");
    await db.prepare(
      `UPDATE ledger_entries
       SET reconciliation_status = 'unmatched',
           updated_at = ?
       WHERE user_id = ? AND id IN (${placeholders}) AND reconciliation_status <> 'matched'`
    ).run(nowIso(), input.userId, ...input.entryIds);
  },

  async createTransferSuggestion(input: {
    userId: string;
    outEntryId: string;
    inEntryId: string;
    score: number;
    metadata?: Record<string, unknown> | null;
  }) {
    const id = createId();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO transfer_match_suggestions (
         id, user_id, out_entry_id, in_entry_id, score, status, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'suggested', ?, ?, ?)
       ON CONFLICT (user_id, out_entry_id, in_entry_id)
       DO UPDATE SET score = EXCLUDED.score, status = 'suggested', metadata_json = EXCLUDED.metadata_json, updated_at = EXCLUDED.updated_at`
    ).run(
      id,
      input.userId,
      input.outEntryId,
      input.inEntryId,
      Number(input.score.toFixed(6)),
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now
    );
  },

  async listTransferSuggestions(userId: string, limit = 100) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, out_entry_id, in_entry_id, score, status, metadata_json, created_at, updated_at
         FROM transfer_match_suggestions
         WHERE user_id = ? AND status = 'suggested'
         ORDER BY score DESC, created_at ASC
         LIMIT ?`
      )
      .all(userId, limit)) as TransferSuggestionRow[];

    return rows.map(mapTransferSuggestion);
  },

  async findTransferSuggestionById(userId: string, id: string) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, out_entry_id, in_entry_id, score, status, metadata_json, created_at, updated_at
         FROM transfer_match_suggestions
         WHERE user_id = ? AND id = ?
         LIMIT 1`
      )
      .get(userId, id)) as TransferSuggestionRow | undefined;
    return row ? mapTransferSuggestion(row) : null;
  },

  async updateTransferSuggestionStatus(input: {
    userId: string;
    suggestionId: string;
    status: "suggested" | "confirmed" | "rejected";
  }) {
    await db.prepare(
      `UPDATE transfer_match_suggestions
       SET status = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`
    ).run(input.status, nowIso(), input.userId, input.suggestionId);
  },

  async markTransferSuggestionsAsConfirmed(input: {
    userId: string;
    outEntryId: string;
    inEntryId: string;
  }) {
    await db.prepare(
      `UPDATE transfer_match_suggestions
       SET status = 'confirmed',
           updated_at = ?
       WHERE user_id = ?
         AND (
           (out_entry_id = ? AND in_entry_id = ?)
           OR (out_entry_id = ? AND in_entry_id = ?)
         )`
    ).run(
      nowIso(),
      input.userId,
      input.outEntryId,
      input.inEntryId,
      input.inEntryId,
      input.outEntryId
    );
  },

  async addReconciliationDenial(input: { userId: string; entryId: string; reason?: string }) {
    await db.prepare(
      `INSERT INTO reconciliation_denials (id, user_id, entry_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, entry_id) DO NOTHING`
    ).run(createId(), input.userId, input.entryId, input.reason ?? null, nowIso());
  },

  async listUnmatchedCcPayments(userId: string) {
    const rows = (await db
      .prepare(
        `SELECT id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
                account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
                fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at
         FROM ledger_entries
         WHERE user_id = ?
           AND type = 'cc_payment'
           AND (credit_card_account_id IS NULL OR reconciliation_status <> 'matched')
         ORDER BY posted_at DESC, created_at DESC`
      )
      .all(userId)) as LedgerEntryRow[];
    return rows.map(mapLedgerEntry);
  },

  async confirmCreditCardPayment(input: { userId: string; entryId: string; creditCardAccountId: string }) {
    await db.prepare(
      `UPDATE ledger_entries
       SET credit_card_account_id = ?,
           reconciliation_status = 'matched',
           updated_at = ?
       WHERE user_id = ? AND id = ? AND type = 'cc_payment'`
    ).run(input.creditCardAccountId, nowIso(), input.userId, input.entryId);
  },

  async listRecentCardPurchases(input: {
    userId: string;
    creditCardAccountId: string;
    from: Date;
    to: Date;
  }) {
    const row = (await db
      .prepare(
        `SELECT COALESCE(SUM(
            CASE
              WHEN type = 'cc_purchase' THEN amount_cents
              WHEN type = 'refund' THEN -amount_cents
              WHEN type = 'cc_payment' THEN -amount_cents
              ELSE 0
            END
          ), 0) AS debt_cents
         FROM ledger_entries
         WHERE user_id = ?
           AND credit_card_account_id = ?
           AND posted_at >= ?
           AND posted_at <= ?`
      )
      .get(input.userId, input.creditCardAccountId, input.from.toISOString(), input.to.toISOString())) as
      | { debt_cents: number | string | null }
      | undefined;

    return Number(row?.debt_cents ?? 0);
  },

  async getDashboardSummary(input: {
    userId: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    ledgerEntryCount: number;
    incomeTotal: number;
    totalSpending: number;
    cashBalance: Array<{
      accountId: string;
      accountName: string;
      currency: string;
      amount: number;
    }>;
    cardDebt: Array<{
      creditCardAccountId: string;
      creditCardName: string;
      currency: string;
      amount: number;
    }>;
  }> {
    const range = buildDateFilters({ from: input.from, to: input.to });
    const countRow = (await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM ledger_entries
         WHERE user_id = ?
           ${range.sql}`
      )
      .get(input.userId, ...range.params)) as { count: number | string | null } | undefined;

    const ledgerEntryCount = Number(countRow?.count ?? 0);
    if (ledgerEntryCount <= 0) {
      return {
        ledgerEntryCount: 0,
        incomeTotal: 0,
        totalSpending: 0,
        cashBalance: [],
        cardDebt: []
      };
    }

    const totalsRow = (await db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
           COALESCE(SUM(CASE WHEN type IN ('expense', 'cc_purchase') THEN amount_cents ELSE 0 END), 0) AS spending_cents
         FROM ledger_entries
         WHERE user_id = ?
           ${range.sql}`
      )
      .get(input.userId, ...range.params)) as
      | { income_cents: number | string | null; spending_cents: number | string | null }
      | undefined;

    const cashRows = (await db
      .prepare(
        `SELECT
           a.id AS account_id,
           a.name AS account_name,
           a.currency AS currency,
           COALESCE(
             SUM(
               CASE
                 WHEN le.type = 'income' THEN le.amount_cents
                 WHEN le.type = 'expense' THEN -le.amount_cents
                 WHEN le.type = 'transfer' AND le.direction = 'IN' THEN le.amount_cents
                 WHEN le.type = 'transfer' AND le.direction = 'OUT' THEN -le.amount_cents
                 WHEN le.type = 'cc_payment' AND le.direction = 'OUT' THEN -le.amount_cents
                 WHEN le.type = 'cc_payment' AND le.direction = 'IN' THEN le.amount_cents
                 WHEN le.type = 'fee' THEN -le.amount_cents
                 WHEN le.type = 'refund' AND le.direction = 'IN' THEN le.amount_cents
                 WHEN le.type = 'refund' AND le.direction = 'OUT' THEN -le.amount_cents
                 ELSE 0
               END
             ),
             0
           ) AS total_cents
         FROM accounts a
         LEFT JOIN ledger_entries le
           ON le.user_id = a.user_id
          AND le.account_id = a.id
          ${range.sql}
         WHERE a.user_id = ?
           AND a.type IN ('checking', 'cash')
         GROUP BY a.id, a.name, a.currency
         ORDER BY a.name ASC`
      )
      .all(...range.params, input.userId)) as Array<{
      account_id: string;
      account_name: string;
      currency: string;
      total_cents: number | string | null;
    }>;

    const cardDebtRows = (await db
      .prepare(
        `SELECT
           cca.id AS credit_card_account_id,
           cca.name AS credit_card_name,
           cca.currency AS currency,
           COALESCE(
             SUM(
               CASE
                 WHEN le.type = 'cc_purchase' THEN le.amount_cents
                 WHEN le.type = 'refund' THEN -le.amount_cents
                 WHEN le.type = 'cc_payment' THEN -le.amount_cents
                 ELSE 0
               END
             ),
             0
           ) AS debt_cents
         FROM credit_card_accounts cca
         LEFT JOIN ledger_entries le
           ON le.user_id = cca.user_id
          AND le.credit_card_account_id = cca.id
          AND (${input.to ? "le.posted_at <= ?" : "TRUE"})
         WHERE cca.user_id = ?
         GROUP BY cca.id, cca.name, cca.currency
         ORDER BY cca.name ASC`
      )
      .all(...(input.to ? [input.to.toISOString()] : []), input.userId)) as Array<{
      credit_card_account_id: string;
      credit_card_name: string;
      currency: string;
      debt_cents: number | string | null;
    }>;

    return {
      ledgerEntryCount,
      incomeTotal: Number((Number(totalsRow?.income_cents ?? 0) / 100).toFixed(2)),
      totalSpending: Number((Number(totalsRow?.spending_cents ?? 0) / 100).toFixed(2)),
      cashBalance: cashRows.map((row) => ({
        accountId: row.account_id,
        accountName: row.account_name,
        currency: row.currency,
        amount: Number((Number(row.total_cents ?? 0) / 100).toFixed(2))
      })),
      cardDebt: cardDebtRows.map((row) => ({
        creditCardAccountId: row.credit_card_account_id,
        creditCardName: row.credit_card_name,
        currency: row.currency,
        amount: Number((Number(row.debt_cents ?? 0) / 100).toFixed(2))
      }))
    };
  },

  async getReviewInbox(userId: string) {
    const suggestions = await this.listTransferSuggestions(userId, 200);
    const ccPayments = await this.listUnmatchedCcPayments(userId);

    const entryIds = new Set<string>();
    for (const suggestion of suggestions) {
      entryIds.add(suggestion.outEntryId);
      entryIds.add(suggestion.inEntryId);
    }

    const entriesById = new Map<string, ReturnType<typeof mapLedgerEntry>>();
    if (entryIds.size > 0) {
      const placeholders = [...entryIds].map(() => "?").join(",");
      const rows = (await db
        .prepare(
          `SELECT id, user_id, posted_at, amount_cents, direction, type, description_normalized, merchant_normalized,
                  account_id, credit_card_account_id, category_id, import_source_id, raw_transaction_id, external_ref,
                  fingerprint, transfer_group_id, reconciliation_status, transfer_fee_cents, created_at, updated_at
           FROM ledger_entries
           WHERE user_id = ? AND id IN (${placeholders})`
        )
        .all(userId, ...entryIds)) as LedgerEntryRow[];

      for (const row of rows) {
        entriesById.set(row.id, mapLedgerEntry(row));
      }
    }

    const accounts = (await db
      .prepare(
        `SELECT id, name
         FROM accounts
         WHERE user_id = ?`
      )
      .all(userId)) as Array<{ id: string; name: string }>;
    const accountById = new Map(accounts.map((item) => [item.id, item.name]));

    const cards = await this.listCreditCardAccounts(userId);
    const cardById = new Map(cards.map((item) => [item.id, item.name]));

    return {
      transferSuggestions: suggestions.map((item) => {
        const outEntry = entriesById.get(item.outEntryId) ?? null;
        const inEntry = entriesById.get(item.inEntryId) ?? null;
        return {
          id: item.id,
          score: Number(item.score.toFixed(3)),
          outEntryId: item.outEntryId,
          inEntryId: item.inEntryId,
          outEntry: outEntry
            ? {
                id: outEntry.id,
                date: outEntry.postedAt.toISOString(),
                amount: outEntry.amount,
                accountId: outEntry.accountId,
                accountName: outEntry.accountId ? (accountById.get(outEntry.accountId) ?? "Conta") : null,
                description: outEntry.descriptionNormalized
              }
            : null,
          inEntry: inEntry
            ? {
                id: inEntry.id,
                date: inEntry.postedAt.toISOString(),
                amount: inEntry.amount,
                accountId: inEntry.accountId,
                accountName: inEntry.accountId ? (accountById.get(inEntry.accountId) ?? "Conta") : null,
                description: inEntry.descriptionNormalized
              }
            : null
        };
      }),
      unmatchedCardPayments: ccPayments.map((entry) => ({
        id: entry.id,
        date: entry.postedAt.toISOString(),
        amount: entry.amount,
        description: entry.descriptionNormalized,
        accountId: entry.accountId,
        accountName: entry.accountId ? (accountById.get(entry.accountId) ?? "Conta") : null,
        creditCardAccountId: entry.creditCardAccountId,
        creditCardAccountName: entry.creditCardAccountId
          ? (cardById.get(entry.creditCardAccountId) ?? "Cartão")
          : null
      })),
      cards: cards.map((card) => ({
        id: card.id,
        name: card.name,
        defaultPaymentAccountId: card.defaultPaymentAccountId
      }))
    };
  },

  async deleteEntriesByExternalRefs(userId: string, externalRefs: string[]): Promise<number> {
    const refs = [
      ...new Set(
        externalRefs
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    ];

    if (refs.length === 0) {
      return 0;
    }

    const placeholders = refs.map(() => "?").join(",");
    const result = await db.prepare(
      `DELETE FROM ledger_entries
       WHERE user_id = ?
         AND external_ref IN (${placeholders})`
    ).run(userId, ...refs);

    return result.changes;
  },

  async attachExternalRefIfMissing(input: {
    userId: string;
    entryId: string;
    externalRef: string;
  }): Promise<number> {
    const normalized = input.externalRef.trim();
    if (!normalized) {
      return 0;
    }

    const result = await db.prepare(
      `UPDATE ledger_entries
       SET external_ref = ?,
           updated_at = ?
       WHERE user_id = ?
         AND id = ?
         AND (external_ref IS NULL OR BTRIM(external_ref) = '')`
    ).run(normalized, nowIso(), input.userId, input.entryId);

    return result.changes;
  },

  async deleteEntriesByAccountRef(userId: string, accountId: string): Promise<number> {
    const result = await db.prepare(
      `DELETE FROM ledger_entries
       WHERE user_id = ?
         AND (account_id = ? OR credit_card_account_id = ?)`
    ).run(userId, accountId, accountId);

    return result.changes;
  }
};
