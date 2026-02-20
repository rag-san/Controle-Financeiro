# Controle Financeiro (Next.js + SQLite local)

Aplicativo de controle financeiro com App Router, NextAuth e persistência local em SQLite via `better-sqlite3` (sem Prisma/ORM).

## Stack

- Next.js (App Router)
- NextAuth (Credentials)
- SQLite local (`better-sqlite3`)
- Tailwind CSS
- Recharts
- Zod

## Estrutura do projeto

```txt
app/                 # pages e rotas API (Next App Router)
components/          # componentes de UI e blocos de tela
lib/
  db/                # conexão SQLite, migração e init
  server/            # repositórios SQL (accounts, transactions, dashboard, ...)
  *.ts               # utilitários compartilhados (auth, cache, parse, normalize, etc)
styles/              # estilos globais
types/               # tipos globais (NextAuth e afins)
data/                # banco local finance.db (criado em runtime)
```

## Onde fica o banco

- Arquivo: `data/finance.db`
- O diretório `data/` é criado automaticamente.
- Tabelas e índices são criados automaticamente na inicialização da API.

## Como rodar

```bash
npm install
npm run dev
```

## Ciclo rapido (dia a dia)

```bash
npm run verify
```

- `verify` roda apenas TypeScript + ESLint (bem mais rapido que build completo).

## Build

```bash
npm run verify
npm run build
npm run start
```

- `build` agora roda com `--no-lint` para reduzir tempo.
- Se quiser validação e build em um comando:

```bash
npm run build:full
```

## Resetar o banco

Pare o servidor e apague o arquivo:

```bash
rm data/finance.db
```

No Windows PowerShell:

```powershell
Remove-Item .\data\finance.db -Force
```

Ao iniciar novamente, o schema é recriado automaticamente.

## Endpoints principais

- `GET|POST /api/transactions`
- `PATCH|DELETE /api/transactions/:id`
- `GET|POST /api/categories`
- `PATCH|DELETE /api/categories/:id`
- `GET /api/dashboard`
- `GET /api/dashboard/summary?from=ISO&to=ISO`
- `POST /api/categories/bootstrap` (restaura categorias/regras padrao)

## Exemplos (curl)

Obs: endpoints autenticados exigem sessão (cookie do NextAuth).

Criar categoria:

```bash
curl -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Mercado","color":"#22c55e","icon":"ShoppingCart"}'
```

Criar transação:

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"accountId":"<account-id>","date":"2026-02-15","description":"Supermercado","amount":-189.90,"categoryId":"<category-id>"}'
```

Resumo dashboard por período:

```bash
curl "http://localhost:3000/api/dashboard/summary?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z"
```

Restaurar categorias padrao:

```bash
curl -X POST http://localhost:3000/api/categories/bootstrap
```

## IA local opcional (Ollama)

- No import wizard, habilite `Usar IA local (opcional)`.
- Configure no `.env`:
  - `OLLAMA_URL`
  - `OLLAMA_MODEL`
  - `LOCAL_AI_TIMEOUT_MS`
  - `LOCAL_AI_MIN_CONFIDENCE`
- A IA local so e usada quando nenhuma regra (`contains/regex`) casar.
