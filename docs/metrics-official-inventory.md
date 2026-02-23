# Inventario de Consumo - Metricas Oficiais

Data de referencia: 2026-02-23

## Frontend (paginas principais)

1. `src/features/reports/ReportsPage.tsx`
- Fonte: `/api/metrics/official?view=reports`
- Status: oficial

2. `src/features/cashflow/hooks/useCashflowData.ts`
- Fonte: `/api/metrics/official?view=cashflow`
- Status: oficial

3. `src/features/categories/CategoriesPage.tsx`
- Fonte: `/api/metrics/official?view=categories`
- Status: oficial

4. `src/features/dashboard/DashboardPage.tsx`
- Fonte: `/api/metrics/official?view=dashboard`
- Status: oficial (migrado)

## Endpoints oficiais de suporte

1. `app/api/metrics/official/route.ts`
- Views oficiais: `reports`, `cashflow`, `categories`, `dashboard`
- Observacao: `dashboard` com snapshot mensal para historico.

2. `app/api/metrics/audit/route.ts`
- Export/consulta de reconciliacao por periodo (`json` e `csv`).

3. `app/api/metrics/import-observability/route.ts`
- Relatorio interno de parse/commit por `sourceType` e erros recentes.

## Endpoints com agregacao legada (mantidos por compatibilidade)

1. `app/api/dashboard/route.ts`
- Uso atual no frontend: nao
- Observacao: manter temporariamente para compatibilidade externa.
- Status: `deprecated` via headers (`Deprecation`, `Sunset`, `X-API-Successor`).

2. `app/api/reports/route.ts`
- Uso atual no frontend: nao
- Observacao: manter temporariamente para compatibilidade externa.
- Status: `deprecated` via headers (`Deprecation`, `Sunset`, `X-API-Successor`).

## Observacoes de regra oficial

1. `transfer` nao entra em totais de receita/despesa nem em categorias.
2. `transfer` impacta saldo de contas.
3. Regras de soma/precisao centralizadas em `lib/finance/official-metrics.ts`.
