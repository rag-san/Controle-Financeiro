# Codebase Data-Flow Audit

## Scope
- Runtime surfaces analyzed:
  - Next.js app routes (`app/(app)/**`, `app/(auth)/**`)
  - API routes (`app/api/**/route.ts`)
  - Frontend data fetchers in features (`src/features/**`)
  - Server repositories/services (`lib/server/**`)
  - Database schema/migrations (`lib/db/migrate.ts`)
- Non-runtime prototype artifacts were considered for dead-code cleanup.

## Frontend Entry Points
- App shell:
  - `app/(app)/layout.tsx`
  - `components/layout/PageShell.tsx`
  - `components/layout/Sidebar.tsx`
  - `components/layout/Topbar.tsx`
- Auth:
  - `app/(auth)/login/page.tsx`
  - `src/features/auth/AuthPanel.tsx`
- Product surfaces:
  - Dashboard: `app/(app)/dashboard/page.tsx` -> `src/features/dashboard/DashboardPage.tsx`
  - Transactions: `app/(app)/transactions/page.tsx` -> `src/features/transactions/TransactionsPage.tsx`
  - Cashflow: `app/(app)/cashflow/page.tsx`
  - Accounts: `app/(app)/accounts/page.tsx`
  - Net worth: `app/(app)/net-worth/page.tsx`
  - Recurring: `app/(app)/recurring/page.tsx`
  - Categories: `app/(app)/categories/page.tsx`
  - Reports: `app/(app)/reports/page.tsx`

## Backend API Surface
- Core CRUD/data:
  - `/api/transactions` (+ `[id]`)
  - `/api/accounts` (+ `[id]`)
  - `/api/categories` (+ `[id]`, `/rules`, `/rules/[id]`, `/bootstrap`, `/reapply`)
  - `/api/net-worth` (+ `[id]`)
  - `/api/recurring` (+ `[id]`, `/bootstrap`)
- Dashboard metrics:
  - `/api/dashboard/summary`
  - `/api/dashboard/categories`
  - `/api/dashboard/trends`
  - `/api/dashboard/patrimony`
  - `/api/dashboard/overview` (new aggregated endpoint)
- Imports/metrics:
  - `/api/imports`, `/api/imports/parse`, `/api/imports/commit`
  - `/api/metrics/official`
  - `/api/metrics/audit`
  - `/api/metrics/import-observability`
- Auth:
  - `/api/auth/[...nextauth]`
  - `/api/auth/register`

## Input Validation and Auth
- Auth guard:
  - All protected routes use `requireUser()` from `lib/api-auth.ts`.
  - Session/token resolved through NextAuth (`lib/auth.ts`, `middleware.ts`).
- Input validation:
  - Payload/query validation uses Zod across routes (`safeParse`/`parse`).
  - Dashboard range parsing centralized in `app/api/dashboard/_query.ts`.
- Data access:
  - Routes call service/repo layer (`lib/server/*repo.ts`, `*service.ts`).
  - SQL is parameterized via `db.prepare(...).all/get/run`.

## Data Path (Request -> DB -> Response)
- Transactions list:
  - `TransactionsPage.tsx` -> `GET /api/transactions` -> `listTransactionsForUser` -> `transactions.repo` -> `transactions` table.
- Dashboard cards/charts:
  - `DashboardPage.tsx` -> `GET /api/dashboard/overview` -> `dashboard-metrics.repo` -> aggregated SQL over `transactions/categories/accounts`.
- Import flow:
  - `ImportTransactionsContent.tsx` -> `/api/imports/parse` + `/api/imports/commit` -> parse registry + commit service -> writes `transactions/import_*`.

## Dead Code Cleanup Applied
- Removed unused redesign prototype feature (not referenced by runtime app):
  - `src/features/redesign/RedesignPrototypePages.tsx`
  - `src/features/redesign/RedesignSurfaceBody.tsx`

## Optimizations Applied
- Dashboard fetch optimization:
  - Frontend moved from 4 API calls to 1 aggregated call.
  - New endpoint: `app/api/dashboard/overview/route.ts`.
  - Backend now executes summary/categories/trends/patrimony in `Promise.all` for the same date range.
  - Reduces roundtrips, improves consistency, and lowers UI loading coordination complexity.
- Dev/ops reliability:
  - npm scripts now always load `.env` for DB-dependent scripts.
  - Added maintenance scripts:
    - `scripts/cleanup-test-users.ts`
    - `scripts/db-health-check.ts`

## DB Integrity Checks in Place
- Checks include:
  - Orphan accounts/categories/rules/transactions
  - Transfer flag consistency
  - Duplicate imported hash per user
  - Duplicate category name (case-insensitive) per user
- Command:
  - `npm run db:health`

## Current Risk Notes
- Deprecated compatibility routes (`/api/dashboard`, `/api/reports`) remain intentionally for backward compatibility headers.
- Legacy uppercase tables still exist (`Account`, `Category`, etc.) but are empty; runtime uses lowercase tables.
