import { db } from "./db";

type TableInfoRow = {
  name: string;
};

async function ensureColumn(table: string, column: string, ddlFragment: string): Promise<void> {
  if (db.dialect === "postgres") {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${ddlFragment}`);
    return;
  }

  const rows = (await db.prepare(`PRAGMA table_info(${table})`).all()) as TableInfoRow[];
  const hasColumn = rows.some((row) => row.name === column);
  if (hasColumn) {
    return;
  }

  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlFragment}`);
}

async function ensurePostgresTransactionTypeEnum(): Promise<void> {
  if (db.dialect !== "postgres") {
    return;
  }

  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
      END IF;
    END
    $$;
  `);

  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions'
          AND column_name = 'type'
          AND (data_type <> 'USER-DEFINED' OR udt_name <> 'transaction_type')
      ) THEN
        ALTER TABLE transactions
          ALTER COLUMN type TYPE transaction_type
          USING LOWER(type)::transaction_type;
      END IF;
    END
    $$;
  `);
}

async function ensurePostgresTransactionDirectionEnum(): Promise<void> {
  if (db.dialect !== "postgres") {
    return;
  }

  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_direction') THEN
        CREATE TYPE transaction_direction AS ENUM ('in', 'out');
      END IF;
    END
    $$;
  `);

  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions'
          AND column_name = 'direction'
          AND (data_type <> 'USER-DEFINED' OR udt_name <> 'transaction_direction')
      ) THEN
        ALTER TABLE transactions
          ALTER COLUMN direction TYPE transaction_direction
          USING COALESCE(NULLIF(LOWER(direction), ''), CASE WHEN amount_cents < 0 THEN 'out' ELSE 'in' END)::transaction_direction;
      END IF;
    END
    $$;
  `);
}

async function runMigrations(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      institution TEXT,
      currency TEXT NOT NULL DEFAULT 'BRL',
      parent_account_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user_type ON accounts(user_id, type);
    CREATE INDEX IF NOT EXISTS idx_accounts_user_name ON accounts(user_id, name);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      icon TEXT,
      parent_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_user_name ON categories(user_id, name);
    CREATE INDEX IF NOT EXISTS idx_categories_user_parent ON categories(user_id, parent_id);

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mapping_json TEXT,
      total_imported INTEGER NOT NULL DEFAULT 0,
      total_skipped INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_import_batches_user_imported ON import_batches(user_id, imported_at);

    CREATE TABLE IF NOT EXISTS import_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      event TEXT NOT NULL,
      phase TEXT NOT NULL,
      error_code TEXT,
      total_rows INTEGER,
      valid_rows INTEGER,
      ignored_rows INTEGER,
      error_rows INTEGER,
      imported INTEGER,
      skipped INTEGER,
      duplicates INTEGER,
      invalid_rows INTEGER,
      transfer_created INTEGER,
      internal_transfer_auto_matched INTEGER,
      card_payment_detected INTEGER,
      card_payment_not_converted INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_import_events_user_created ON import_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_events_user_source_phase ON import_events(user_id, source_type, phase);
    CREATE INDEX IF NOT EXISTS idx_import_events_user_error_code ON import_events(user_id, error_code, created_at);

    CREATE TABLE IF NOT EXISTS official_metric_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshots_user_metric_period
      ON official_metric_snapshots(user_id, metric_key, period_key);
    CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user_metric_period
      ON official_metric_snapshots(user_id, metric_key, period_key, updated_at);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      category_id TEXT,
      import_batch_id TEXT,
      posted_at TEXT NOT NULL,
      description TEXT NOT NULL,
      normalized_description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BRL',
      type TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'out',
      is_internal_transfer BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'posted',
      account TEXT,
      bank TEXT,
      external_id TEXT,
      imported_hash TEXT,
      transfer_group_id TEXT,
      transfer_peer_tx_id TEXT,
      transfer_from_account_id TEXT,
      transfer_to_account_id TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL,
      FOREIGN KEY (transfer_peer_tx_id) REFERENCES transactions(id) ON DELETE SET NULL,
      FOREIGN KEY (transfer_from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (transfer_to_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_user_hash
      ON transactions(user_id, imported_hash)
      WHERE imported_hash IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_user_posted ON transactions(user_id, posted_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON transactions(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_account ON transactions(user_id, account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_posted ON transactions(account_id, posted_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_posted ON transactions(category_id, posted_at);

    CREATE TABLE IF NOT EXISTS import_items (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      tx_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_import_items_batch ON import_items(batch_id);

    CREATE TABLE IF NOT EXISTS recurring_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_day INTEGER NOT NULL,
      category_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_user_status ON recurring_items(user_id, status);

    CREATE TABLE IF NOT EXISTS net_worth_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      value_cents INTEGER NOT NULL,
      date_iso TEXT NOT NULL,
      group_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_net_worth_user_date ON net_worth_entries(user_id, date_iso);
    CREATE INDEX IF NOT EXISTS idx_net_worth_user_type_date ON net_worth_entries(user_id, type, date_iso);

    CREATE TABLE IF NOT EXISTS category_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_type TEXT NOT NULL,
      pattern TEXT NOT NULL,
      account_id TEXT,
      min_amount_cents INTEGER,
      max_amount_cents INTEGER,
      category_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rules_user_priority ON category_rules(user_id, priority);
    CREATE INDEX IF NOT EXISTS idx_rules_user_enabled ON category_rules(user_id, enabled);
  `);

  await ensureColumn("accounts", "parent_account_id", "TEXT");
  await ensureColumn("transactions", "transfer_group_id", "TEXT");
  await ensureColumn("transactions", "transfer_peer_tx_id", "TEXT");
  await ensureColumn("transactions", "transfer_from_account_id", "TEXT");
  await ensureColumn("transactions", "transfer_to_account_id", "TEXT");
  await ensureColumn("transactions", "direction", "TEXT NOT NULL DEFAULT 'out'");
  await ensureColumn("transactions", "is_internal_transfer", "BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn("import_events", "internal_transfer_auto_matched", "INTEGER");

  if (db.dialect === "postgres") {
    await db.exec(`
      UPDATE transactions
      SET direction = CASE WHEN amount_cents < 0 THEN 'out' ELSE 'in' END
      WHERE direction IS NULL
         OR LOWER(direction::text) <> CASE WHEN amount_cents < 0 THEN 'out' ELSE 'in' END
         OR BTRIM(direction::text) = ''
         OR direction::text NOT IN ('in', 'out');
    `);
    await db.exec(`
      UPDATE transactions
      SET is_internal_transfer = CASE WHEN type = 'transfer' THEN TRUE ELSE FALSE END
      WHERE is_internal_transfer IS DISTINCT FROM CASE WHEN type = 'transfer' THEN TRUE ELSE FALSE END;
    `);
    await db.exec(`
      UPDATE transactions AS t
      SET transfer_from_account_id = COALESCE(
            t.transfer_from_account_id,
            (
              SELECT src.account_id
              FROM transactions AS src
              WHERE src.user_id = t.user_id
                AND src.transfer_group_id = t.transfer_group_id
                AND src.type = 'transfer'
                AND src.amount_cents < 0
              ORDER BY src.posted_at ASC, src.created_at ASC
              LIMIT 1
            )
          ),
          transfer_to_account_id = COALESCE(
            t.transfer_to_account_id,
            (
              SELECT dst.account_id
              FROM transactions AS dst
              WHERE dst.user_id = t.user_id
                AND dst.transfer_group_id = t.transfer_group_id
                AND dst.type = 'transfer'
                AND dst.amount_cents > 0
              ORDER BY dst.posted_at ASC, dst.created_at ASC
              LIMIT 1
            )
          )
      WHERE t.type = 'transfer'
        AND t.transfer_group_id IS NOT NULL
        AND (t.transfer_from_account_id IS NULL OR t.transfer_to_account_id IS NULL);
    `);
  } else {
    await db.exec(`
      UPDATE transactions
      SET direction = CASE WHEN amount_cents < 0 THEN 'out' ELSE 'in' END
      WHERE direction IS NULL
         OR LOWER(direction) <> CASE WHEN amount_cents < 0 THEN 'out' ELSE 'in' END
         OR TRIM(direction) = ''
         OR direction NOT IN ('in', 'out');
    `);
    await db.exec(`
      UPDATE transactions
      SET is_internal_transfer = CASE WHEN type = 'transfer' THEN 1 ELSE 0 END
      WHERE CAST(COALESCE(is_internal_transfer, 0) AS INTEGER) <> CASE WHEN type = 'transfer' THEN 1 ELSE 0 END;
    `);
    await db.exec(`
      UPDATE transactions AS t
      SET transfer_from_account_id = COALESCE(
            t.transfer_from_account_id,
            (
              SELECT src.account_id
              FROM transactions AS src
              WHERE src.user_id = t.user_id
                AND src.transfer_group_id = t.transfer_group_id
                AND src.type = 'transfer'
                AND src.amount_cents < 0
              ORDER BY src.posted_at ASC, src.created_at ASC
              LIMIT 1
            )
          ),
          transfer_to_account_id = COALESCE(
            t.transfer_to_account_id,
            (
              SELECT dst.account_id
              FROM transactions AS dst
              WHERE dst.user_id = t.user_id
                AND dst.transfer_group_id = t.transfer_group_id
                AND dst.type = 'transfer'
                AND dst.amount_cents > 0
              ORDER BY dst.posted_at ASC, dst.created_at ASC
              LIMIT 1
            )
          )
      WHERE t.type = 'transfer'
        AND t.transfer_group_id IS NOT NULL
        AND (t.transfer_from_account_id IS NULL OR t.transfer_to_account_id IS NULL);
    `);
  }

  await ensurePostgresTransactionTypeEnum();
  await ensurePostgresTransactionDirectionEnum();

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_parent ON accounts(user_id, parent_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_group ON transactions(user_id, transfer_group_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_transfer_group ON transactions(account_id, transfer_group_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_from ON transactions(user_id, transfer_from_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_to ON transactions(user_id, transfer_to_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_internal_transfer ON transactions(user_id, is_internal_transfer);
  `);
}

export async function migrate(): Promise<void> {
  await runMigrations();
}



