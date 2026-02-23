# Roadmap 1.1.0 - Consistencia de Metricas e Fluxo de Cartao

## Contexto

A base de importacao evoluiu com suporte a transferencia, conta mae/filha e endpoint de metricas oficiais.
O proximo passo e eliminar divergencias residuais entre endpoints/telas e aumentar rastreabilidade.

## Objetivo principal

Garantir que todos os indicadores financeiros exibam os mesmos totais, com as mesmas regras, em qualquer periodo/filtro.

## Status (2026-02-23)

- [x] P0.1 Fonte unica de metricas no frontend
- [x] P0.2 Contrato oficial de regras financeiras + testes
- [x] P0.3 Reconciliacao automatica em `npm run validate`
- [x] P0.4 Endpoints legados marcados como `deprecated` com sucessor oficial
- [x] P1.1 Observabilidade de importacao por fonte + relatorio interno
- [x] P1.2 UX de transferencia com ajuste/reprocessamento no preview
- [x] P1.3 Checklist e guard-rails de schema/migracao
- [x] P2.1 Snapshot mensal de metricas oficiais (dashboard)
- [x] P2.2 Auditoria exportavel de reconciliacao (`json`/`csv`)

## Escopo

### P0 (must-have)

1. Fonte unica de metricas no frontend
- Padronizar consumo em todas as telas para `/api/metrics/official` (ou wrappers derivados dele).
- Reduzir agregacoes duplicadas no client.
- Definir contrato unico por view (`reports`, `cashflow`, `categories`, `dashboard`).

2. Contrato oficial de regras financeiras
- Documentar regras canonicamente:
  - `income` soma em receitas.
  - `expense` soma em despesas.
  - `transfer` nunca entra em receitas/despesas/categorias, mas afeta saldo por conta.
  - `credit_card_invoice` roteia para conta `credit`.
- Criar testes de contrato para essas regras (unidade e integracao).

3. Reconciliacao automatica de valores
- Adicionar checks de consistencia:
  - soma categorias do periodo == total de despesas do periodo.
  - serie temporal consolidada == totais do mesmo filtro.
  - saldo por conta == soma historica de transacoes da conta.
- Expor script de validacao unico para CI (`npm run validate` ampliado).

4. Desativacao controlada de endpoints legados de agregacao
- Mapear endpoints com logica de agregacao paralela (ex.: `/api/reports` legado).
- Migrar consumidores.
- Marcar legado como `deprecated` e preparar remocao segura.

### P1 (next)

1. Observabilidade de importacao por fonte
- Medir parse/commit por `sourceType` com contadores de:
  - sucesso,
  - erro estruturado,
  - duplicata,
  - conversao em transferencia,
  - pagamentos de fatura nao convertidos.
- Criar relatorio interno simples para suporte tecnico.

2. Fluxo de transferencia mais robusto
- Melhorar UX de erro quando `transfer` nao tem conta destino valida.
- Permitir "corrigir e reprocessar" lote com preview.

3. Governanca de schema e migracoes
- Checklist de campos obrigatorios para novos tipos de transacao.
- Guard-rails para evitar regressao de colunas/indexes em SQLite sem migracoes versionadas.

### P2 (later)

1. Snapshot mensal de metricas oficiais
- Persistir snapshots para acelerar dashboards historicos.

2. Auditoria financeira exportavel
- Export CSV/JSON com reconciliacao por periodo e diferencas detectadas.

## Plano de implementacao

1. Levantar inventario de consumidores de metricas por tela/endpoint.
2. Criar contrato unificado de regras e cobertura de testes.
3. Migrar os consumidores para fonte oficial unica.
4. Adicionar checks de reconciliacao em CI.
5. Deprecar endpoints legados e documentar mudanca.

## Criterios de aceite

1. Todos os cards/graficos principais usam a mesma fonte oficial por view.
2. Transferencias nao impactam receitas/despesas/categorias em nenhum relatorio.
3. Checks de reconciliacao passam em `npm run test` e `npm run validate`.
4. Reimportacoes mantem idempotencia e nao criam pares de transferencia incompletos.
