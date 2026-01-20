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

## ☁️ Deploy no Render

Este repositório já inclui um `render.yaml` com dois serviços (API e Frontend).

### Passo a passo

1. **Faça login no Render** e conecte o GitHub/GitLab com este repositório.
2. No dashboard, clique em **New + → Blueprint** e selecione o repo.
3. O Render vai detectar o `render.yaml` e criar:
   - **controle-financeiro-api** (Node/Express).
   - **controle-financeiro-web** (Static Site).
4. Após criar, ajuste a variável **VITE_API_BASE_URL** do frontend para a URL pública do backend.
5. Rode o deploy.

### Observações

- O plano **free** do Render não permite disco persistente. Se quiser persistência, use um plano pago ou migre para um banco externo.
- Se quiser trocar o domínio/URL do backend, atualize a variável `VITE_API_BASE_URL`.

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
