# Finance Control v1.1.0

Aplicacao full-stack de controle financeiro pessoal com Next.js + PostgreSQL.

## Visao geral

- Frontend e backend no mesmo projeto (Next App Router + API Routes)
- Autenticacao com NextAuth (Credentials)
- Persistencia principal em PostgreSQL (`pg`)
- Importacao de extrato por CSV, OFX e PDF (PDF: suporte atual para Inter e Mercado Pago)
- Dashboard, relatorios, contas, categorias, recorrencias e patrimonio

## Stack

- Next.js 15
- React 19
- TypeScript
- NextAuth
- PostgreSQL (`pg`)
- Zod
- Tailwind CSS
- Recharts

## Arquitetura (resumo)

Fluxo principal:

`UI (app/(app)/*)` -> `API (app/api/*)` -> `services/repos (lib/server/*)` -> `PostgreSQL`

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
- PostgreSQL 14+ (ou superior)

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

- `NEXTAUTH_SECRET`: segredo da sessao/auth (recomendado em producao)
- `AUTH_SECRET`: alias aceito para o segredo de auth (fallback para `NEXTAUTH_SECRET`)
- `NEXTAUTH_URL`: URL base da aplicacao (ex.: `http://localhost:3000`)
- `DATABASE_URL`: string de conexao PostgreSQL (principal)
- `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`: aliases aceitos automaticamente (Vercel Postgres)
- `PG_POOL_MAX`: limite do pool de conexoes PostgreSQL (padrao: `1` no Vercel, `10` fora)
- `PG_IDLE_TIMEOUT_MS` e `PG_CONNECTION_TIMEOUT_MS`: timeouts do pool PostgreSQL
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
- `npm run reset:data`: limpa dados operacionais (transacoes/importacoes/relatorios), preserva usuarios/contas/categorias/regras e garante categorias padrao por usuario
- `npm run reset:data:full`: limpeza total de dados (inclui usuarios, contas, categorias e regras)
- `npm run typecheck`: TypeScript sem emitir arquivos
- `npm run lint`: ESLint (Next)
- `npm run verify`: typecheck + lint
- `npm run test`: testes unitarios + integracao
- `npm run seed`: seed deterministico para dados de backend
- `npm run validate`: validacao de fluxo backend
- `npm run build`: build de producao
- `npm run build:full`: verify + build
- `npm run start`: inicia app em modo producao

## Banco de dados

- Banco principal: PostgreSQL (`DATABASE_URL`)
- Schema/migracoes executam na inicializacao da API
- O `.env` tambem esta no `.gitignore`

### Deploy no Vercel

- Este projeto opera somente com PostgreSQL.
- Configure obrigatoriamente `DATABASE_URL` (ou `POSTGRES_URL`) apontando para PostgreSQL.
- Se estiver usando Vercel Postgres, copie `POSTGRES_URL` para `DATABASE_URL` para manter compatibilidade com ambiente local.
- Em ambientes serverless, mantenha `PG_POOL_MAX` baixo (ex.: `1` a `3`) para evitar excesso de conexoes.
- Recomenda-se configurar `NEXTAUTH_SECRET` (ou `AUTH_SECRET`) em Production e Preview.

### Observacao

- O projeto nao utiliza mais SQLite em runtime nem em scripts oficiais.
- Todo ambiente (local, preview e production) deve apontar para PostgreSQL.

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
- `import-observability` agora retorna `alerts` e `thresholds` para monitoramento ativo de erro/duplicidade/parser.
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
