# Redesign Migration Rollout

This migration keeps the approved topbar controls visually locked while rollout happens by surface.

## Goals

- Preserve the approved top-right controls (`Filtros`, theme toggle, notifications bell).
- Keep mobile responsiveness fully working during each migration increment.
- Enable page-by-page rollout with feature flags.

## Feature Flags

Global:

- `NEXT_PUBLIC_REDESIGN_ALL`

Per surface:

- `NEXT_PUBLIC_REDESIGN_DASHBOARD`
- `NEXT_PUBLIC_REDESIGN_TRANSACTIONS`
- `NEXT_PUBLIC_REDESIGN_CASHFLOW`
- `NEXT_PUBLIC_REDESIGN_ACCOUNTS`
- `NEXT_PUBLIC_REDESIGN_NET_WORTH`
- `NEXT_PUBLIC_REDESIGN_RECURRING`
- `NEXT_PUBLIC_REDESIGN_CATEGORIES`
- `NEXT_PUBLIC_REDESIGN_REPORTS`

Resolution order:

1. Surface flag.
2. Global flag.
3. Default: enabled (`true`).

Implementation: `lib/migration/rollout.ts`

## Route Gating

Route entrypoints in `app/(app)` consume the rollout helper and select the page component by surface.

Current state:

- Legacy and redesign aliases point to the same page component.
- This keeps behavior unchanged while rollout plumbing is already in place.
- As real legacy/redesign pairs are extracted, only route aliases need to change.

## Guardrails

UI lock:

- `tests/unit/topbar-controls-ui-lock.test.ts`
- `docs/ui-lock-topbar-controls.md`

Mobile responsiveness:

- `tests/unit/mobile-responsiveness-guards.test.ts`

Rollout behavior:

- `tests/unit/migration-rollout.test.ts`

## Execution Order

1. Keep UI lock and mobile guards green.
2. Migrate one surface at a time (Dashboard -> Transactions -> Cashflow -> Accounts -> Net Worth -> Recurring -> Categories -> Reports).
3. Enable by surface flag only after unit and manual mobile checks pass.
4. Keep topbar locked controls unchanged across all steps.
