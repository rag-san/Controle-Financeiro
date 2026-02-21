# Testing

## Prerequisites

- Node.js 20+ (project is tested with current Next.js runtime)
- Dependencies installed with `npm install`

## Commands

- Integration tests (API -> DB, auth, import, dashboard, security sanity):

```bash
npm run test
```

- Seed deterministic backend dataset used by validation flow:

```bash
npm run seed
```

- Backend validation script (service-level assertions on reports/transactions):

```bash
npm run validate
```

## What `npm run test` covers

- Unauthorized requests are denied on protected routes
- Signup + login + session validation
- Transactions create/list/filter/pagination
- Transaction categorization update
- CSV import parse + commit
- Import deduplication on repeated commit
- Import payload guardrail (`rows` max size)
- Dashboard summary totals and category aggregation consistency
- Invalid payload rejection (date/amount validation)

## Test data and isolation

- Integration tests use fixture file: `tests/fixtures/import-transactions.csv`
- Test server uses isolated DB file via `FINANCE_DB_PATH=data/finance.integration.db`
- The integration test runner removes test DB files before and after execution
