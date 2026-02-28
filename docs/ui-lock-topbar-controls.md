# UI Lock: Topbar Action Controls

This project has a locked visual contract for the top-right action group shown in the approved screenshot.

## Locked Scope

Keep these controls visually unchanged:

- `Filtros` trigger button in dashboard header.
- Theme toggle icon button.
- Notifications bell icon button.

Reference files:

- `src/features/dashboard/DashboardPage.tsx`
- `components/layout/Topbar.tsx`
- `src/components/ui/IconButton.tsx`
- `src/features/insights/components/NotificationsBell.tsx`

## Guardrails

- Do not change size, radius, spacing, border style, or icon scale of those controls.
- Do not change the `Filtros` label baseline behavior.
- Do not change the `aria-label` semantics for theme or notifications buttons.
- Any style changes around the topbar must preserve mobile layout and tap targets.

## Automated Lock Test

Unit lock test:

- `tests/unit/topbar-controls-ui-lock.test.ts`

Run:

```bash
npm run test:unit -- topbar-controls-ui-lock.test.ts
```

or run full unit suite:

```bash
npm run test:unit
```
