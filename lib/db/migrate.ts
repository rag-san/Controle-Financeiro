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
      status TEXT NOT NULL DEFAULT 'posted',
      account TEXT,
      bank TEXT,
      external_id TEXT,
      imported_hash TEXT,
      transfer_group_id TEXT,
      transfer_peer_tx_id TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL,
      FOREIGN KEY (transfer_peer_tx_id) REFERENCES transactions(id) ON DELETE SET NULL
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

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_parent ON accounts(user_id, parent_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_group ON transactions(user_id, transfer_group_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_transfer_group ON transactions(account_id, transfer_group_id);
  `);
}

export async function migrate(): Promise<void> {
  await runMigrations();
}



