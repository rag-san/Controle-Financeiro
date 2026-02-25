# Checklist de Governanca de Schema (PostgreSQL)

## Objetivo

Evitar regressao de estrutura em um projeto sem migracoes versionadas tradicionais.

## Regras obrigatorias para novos campos

1. Toda coluna nova deve ser adicionada com migracao idempotente:
- usar `ensureColumn(table, column, ddlFragment)` em `lib/db/migrate.ts`;
- nunca assumir que o banco local esta "limpo".

2. Todo indice novo deve usar `CREATE INDEX IF NOT EXISTS`.

3. Novas colunas em `transactions` devem ser refletidas em:
- `lib/server/transactions.repo.ts` (mapeamento SELECT/INSERT/UPDATE),
- `lib/types.ts` (DTOs),
- validacoes de API pertinentes.

4. Se a coluna impactar agregacoes financeiras:
- atualizar contrato em `lib/finance/official-metrics.ts` (quando aplicavel),
- validar impacto em dashboard/relatorios/categorias.

## Regras obrigatorias para novos tipos de transacao

1. Definir comportamento de soma:
- entra em `income`?
- entra em `expense`?
- entra em categorias?

2. Garantir cobertura de:
- parse/import (`lib/csv.ts`, `lib/ofx.ts`, `lib/pdf.ts`, `lib/normalize.ts`),
- commit (`lib/server/imports-commit.service.ts`),
- listagem e filtros (`lib/server/transactions.service.ts`, APIs),
- agregacoes (`official-metrics` e modelos de tela).

3. Adicionar testes de contrato (unit + integration).

## Guard-rails automatizados atuais

`npm run validate` verifica:
- colunas criticas (`parent_account_id`, `transfer_group_id`, `transfer_peer_tx_id`);
- indices criticos de transferencias;
- consistencia de reconciliacao (categorias/serie/sankey/dashboard);
- saldo por conta reconciliado com historico de transacoes.
