# Accounting Model v2

## Scope
- Repository uses SQL layer (`lib/server/*.repo.ts`) with SQLite/PostgreSQL compatibility.
- No Prisma schema is used in this codebase.
- Financial model is enforced with transaction `type` + `direction`.

## Canonical Transaction Model
- `type`:
  - `income`
  - `expense`
  - `transfer`
- `direction`:
  - `in`
  - `out`
- `is_internal_transfer`:
  - `true` for internal transfer legs
  - `false` for normal income/expense
- `transfer_group_id` links transfer legs.

## Explicit Import Policy (No Ambiguity)
- Credit card bill (`credit_card_invoice`):
  - Purchase lines => `expense` on credit account.
  - Payment lines (`PAGAMENTO RECEBIDO`, `PAYMENT RECEIVED`, etc.) => ignored.
- Checking/cash statement:
  - Card payment patterns (`PAGAMENTO FATURA`, `PAGTO CARTAO`, `CREDIT CARD PAYMENT`, `FATURA`) => `transfer`.
  - If destination credit account resolved => create paired transfer.
  - If destination not resolved => create standalone `transfer` OUT (still excluded from income/expense totals).

## Internal Transfer Matching
- Candidate rows must include transfer-like keyword (`PIX`, `TED`, `DOC`, `TRANSFERENCIA`, `TRANSFER`).
- Pairing criteria:
  - Same absolute amount
  - Opposite direction (`out` vs `in`)
  - Different account
  - Date difference <= 1 day
- Weighted confidence:
  - amount: `0.5`
  - date proximity: `0.3`
  - description similarity: `0.2`
- Thresholds:
  - minimum description score: `0.35`
  - minimum total score: `0.75`
- Tie-breaker: higher confidence; if equal, smaller date difference.

## Aggregation Contract
- Expense totals: sum only where `type = 'expense'`.
- Income totals: sum only where `type = 'income'`.
- `transfer` rows are excluded from:
  - expense charts
  - income charts
  - category summaries
  - monthly expense comparisons
- Balances still include transfer legs by signed effect per account.

## Dedup Fingerprint
- Hash key: `date + abs(amount) + normalized_description + account_id`.
- Duplicate check is per-account before insert.

## Backfill Rules
- Migration normalizes existing rows:
  - `direction` derived from `amount_cents` sign.
  - `is_internal_transfer` derived from `type='transfer'`.
  - For rows with `transfer_group_id` and missing `transfer_from_account_id`/`transfer_to_account_id`, values are inferred from negative/positive leg in same group.

## Endpoint Acceptance
- `/api/transactions`:
  - transfer rows expose group and transfer account references.
- `/api/dashboard/summary`:
  - totals include only `income`/`expense`; transfer-only window yields zero income/expense.
- `/api/metrics/official`:
  - DTO includes transfer metadata and keeps type-based totals.

## Operational Metrics
- Import telemetry tracks:
  - `transfer_created`
  - `internal_transfer_auto_matched`
  - `card_payment_detected`
  - `card_payment_not_converted`
- Use `/api/metrics/import-observability` to monitor trend and error profile.
