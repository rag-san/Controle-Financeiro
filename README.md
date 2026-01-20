# Controle Financeiro

Aplicação web para acompanhar receitas e despesas, com autenticação, categorias personalizadas e importação/exportação de CSV.

## ✨ Funcionalidades

- **Cadastro e login** com sessão persistida via token.
- **Dashboard** com saldo, entradas, saídas e análises por categoria e por mês.
- **CRUD de transações** (criar, editar, excluir e limpar tudo).
- **Categorias personalizadas** com restauração ao padrão.
- **Importação de extrato (CSV)** com mapeamento de colunas.
- **Exportação de CSV** das transações filtradas.

## 🧰 Tecnologias

- **Frontend:** React + TypeScript + Vite + Tailwind CSS.
- **Backend:** Node.js + Express.
- **Armazenamento:** arquivo JSON local (por usuário).

## ✅ Requisitos

- Node.js 18+ (recomendado).

## ▶️ Como rodar localmente

### 1) Backend

```bash
cd server
npm install
npm run dev
```

O servidor sobe em `http://localhost:3001`.

### 2) Frontend

```bash
cd ..
npm install
npm run dev
```

O app Vite sobe em `http://localhost:5173`.

## ⚙️ Variáveis de ambiente

### Frontend

Crie um arquivo `.env` na raiz, se necessário:

```bash
VITE_API_BASE_URL=http://localhost:3001
```

### Backend

O servidor aceita variáveis opcionais:

```bash
PORT=3001
DATA_FILE=./data.json
```

- `PORT`: porta do servidor.
- `DATA_FILE`: caminho do arquivo JSON de dados.

## 🧪 Scripts úteis

### Frontend

- `npm run dev` – ambiente de desenvolvimento.
- `npm run build` – build de produção.
- `npm run lint` – lints.
- `npm run test` – testes (Vitest).

### Backend

- `npm run dev` – servidor Express.
- `npm start` – servidor Express.

## 🗂️ Estrutura resumida

```
.
├── src/            # UI React
├── server/         # API Express
└── public/
```

## 📝 Notas

- Os dados são persistidos localmente em arquivo JSON no backend.
- A autenticação usa tokens armazenados no `localStorage`.
