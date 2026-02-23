# Controle Financeiro v1.0.0

Aplicacao full-stack de controle financeiro pessoal com Next.js + SQLite local.

## Visao geral

- Frontend e backend no mesmo projeto (Next App Router + API Routes)
- Autenticacao com NextAuth (Credentials)
- Persistencia local com SQLite (`better-sqlite3`)
- Importacao de extrato por CSV, OFX e PDF (PDF: suporte atual para Inter e Mercado Pago)
- Dashboard, relatorios, contas, categorias, recorrencias e patrimonio

## Stack

- Next.js 15
- React 19
- TypeScript
- NextAuth
- SQLite (`better-sqlite3`)
- Zod
- Tailwind CSS
- Recharts

## Arquitetura (resumo)

Fluxo principal:

`UI (app/(app)/*)` -> `API (app/api/*)` -> `services/repos (lib/server/*)` -> `SQLite (data/finance.db)`

Modulos centrais:

- `app/(app)` paginas autenticadas da aplicacao
- `app/api` endpoints HTTP
- `lib/server/*.repo.ts` acesso a dados e queries
- `lib/server/*.service.ts` regras de dominio
- `lib/db/*` conexao, inicializacao e migracoes
- `components/*` componentes visuais compartilhados
- `src/features/*` modulos de tela/feature

## Requisitos

- Node.js 20+
- npm 10+

## Setup rapido

1. Instale dependencias:

```bash
npm install
```

2. Crie o arquivo de ambiente a partir do exemplo:

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Defina pelo menos um `NEXTAUTH_SECRET` forte no `.env`.

4. Rode em desenvolvimento:

```bash
npm run dev
```

## Variaveis de ambiente

Arquivo de referencia: `.env.example`

- `NEXTAUTH_SECRET`: segredo da sessao/auth (obrigatorio em producao)
- `NEXTAUTH_URL`: URL base da aplicacao (ex.: `http://localhost:3000`)
- `FINANCE_DB_PATH`: caminho do sqlite (padrao: `data/finance.db`)
- `API_PROFILING`: ativa profiling de rotas (`0` ou `1`)
- `API_PROFILING_SLOW_QUERY_MS`: limite para considerar query lenta
- `OLLAMA_URL`: endpoint do Ollama (IA local opcional)
- `OLLAMA_MODEL`: modelo usado para sugestao de categoria
- `LOCAL_AI_TIMEOUT_MS`: timeout da chamada de IA local
- `LOCAL_AI_ABORT_RETRIES`: tentativas extras em timeout
- `LOCAL_AI_MIN_CONFIDENCE`: confianca minima para aceitar sugestao

## Scripts

- `npm run dev`: desenvolvimento (Turbopack)
- `npm run dev:webpack`: desenvolvimento com webpack
- `npm run typecheck`: TypeScript sem emitir arquivos
- `npm run lint`: ESLint (Next)
- `npm run verify`: typecheck + lint
- `npm run test`: testes unitarios + integracao
- `npm run seed`: seed deterministico para dados de backend
- `npm run validate`: validacao de fluxo backend
- `npm run build`: build de producao
- `npm run build:full`: verify + build
- `npm run start`: inicia app em modo producao

## Banco de dados e dados locais

- Banco padrao: `data/finance.db`
- Schema/migracoes executam na inicializacao da API
- Arquivos de banco (`data/*.db`, `*.db-wal`, `*.db-shm`) estao no `.gitignore`
- O `.env` tambem esta no `.gitignore`

## Testes e validacao

Comandos principais:

```bash
npm run verify
npm run test
npm run build
```

Documentacao de testes:

- `TESTING.md`
- Roadmap de evolucao de parser PDF por banco: `docs/PDF_ROADMAP.md`

## Endpoints principais

- Auth: `/api/auth/[...nextauth]`, `/api/auth/register`
- Transacoes: `/api/transactions`, `/api/transactions/:id`
- Importacao: `/api/imports`, `/api/imports/parse`, `/api/imports/commit`
- Dashboard: `/api/dashboard`, `/api/dashboard/summary`
- Metricas oficiais (fonte unificada): `/api/metrics/official`
- Auditoria/export de reconciliacao: `/api/metrics/audit`
- Observabilidade de importacao: `/api/metrics/import-observability`
- Categorias: `/api/categories`, `/api/categories/:id`, `/api/categories/rules`
- Contas: `/api/accounts`, `/api/accounts/:id`
- Relatorios: `/api/reports`
- Recorrencias: `/api/recurring`, `/api/recurring/:id`
- Patrimonio: `/api/net-worth`, `/api/net-worth/:id`
- Observacao: `/api/dashboard` e `/api/reports` estao mantidos por compatibilidade e marcados como `deprecated`.

## IA local opcional (Ollama)

- A IA local pode ajudar na categorizacao durante importacao.
- Ative no wizard de importacao.
- Sem Ollama, o sistema continua funcionando com regras locais.
