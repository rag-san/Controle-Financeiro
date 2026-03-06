# Release Playbook

Guia rapido para preparar e publicar releases do projeto.

## Processo padrao

1. Sincronizar branch:
```bash
git checkout main
git pull origin main
git checkout -b release/<versao>
```

2. Atualizar versao no `package.json`.

3. Validar qualidade:
```bash
npm run verify
npm run test
npm run build
```

4. Executar smoke test manual dos fluxos criticos.

5. Commit final da release:
```bash
git add .
git commit -m "release: <versao>"
```

6. Merge para `main` e push:
```bash
git checkout main
git merge --no-ff release/<versao>
git push origin main
```

7. Criar tag e publicar:
```bash
git tag v<versao>
git push origin v<versao>
```

## Release 1.2.0 (foco: consistencia financeira e responsividade mobile)

### Objetivo

Consolidar a fonte canônica dos dados financeiros, eliminar distorções entre dashboard/relatórios/fluxo de caixa e fechar as principais quebras de usabilidade no mobile.

### Checklist especifico

1. Consistência financeira:
- Unificar métricas oficiais de dashboard, cashflow e reports na mesma regra do ledger.
- Garantir que transferência interna e pagamento de fatura não distorçam receitas, despesas e saldo.
- Validar saldo real de caixa, gasto classificado e saída real de caixa em todas as telas analíticas.

2. Importação e dados:
- Preservar metadados críticos no ledger (`excluded`, `opening balance adjustment`).
- Garantir sincronização estável entre importação, ledger e relatórios.
- Validar importação com dados realistas e evitar duplicação de linhas/efeitos.

3. UX e feedback:
- Padronizar estados de loading, erro, vazio e atualização.
- Garantir que dashboards, filtros, importação e relatórios mostrem feedback explícito ao usuário.

4. Responsividade:
- Corrigir navegação mobile, drawer e topbar.
- Adaptar cards, filtros, formulários, modais e tabelas para 320px, 360px, 390px, 412px, tablet e desktop.
- Remover dependência de scroll horizontal como caminho principal em telas pequenas.

5. Testes:
- Validar `typecheck`, `lint`, `test:unit`, `build` e `test:e2e`.
- Cobrir cenários críticos de consistência financeira e regressão visual/estrutural em mobile.

### Criterio de pronto (DoD)

- `npm run typecheck` passa.
- `npm run lint` passa.
- `npm run test:unit` passa.
- `npm run build` passa.
- `npm run test:e2e` passa.
- Dashboard, transações, cashflow, reports, categorias, contas, patrimônio, recorrentes e revisão funcionam sem quebra relevante em mobile.
- Não há divergência material entre saldo, fluxo de caixa, relatórios e transações.

### Notas de release 1.2.0

- Regras financeiras consolidadas no ledger para dashboard, relatórios e fluxo de caixa.
- Tratamento correto de pagamento de fatura, compras no crédito, transferências internas e exclusões.
- Estados visuais revisados para loading, erro, vazio e atualização.
- Cobertura E2E adicionada para fluxos críticos e validação multi-breakpoint.
- Revisão estrutural da experiência mobile com cards/listas adaptados, modais fullscreen e navegação mais estável.

## Release 1.0.1 (foco: importacao por extrato)

### Objetivo

Melhorar a experiencia de importacao (CSV/OFX/PDF), aumentar acuracia e reduzir erros/dados duplicados.

### Checklist especifico

1. Parser:
- Suportar variacoes comuns de delimitador e encoding em CSV.
- Tratar datas e valores com formatos brasileiros.
- Melhorar tolerancia a layouts de OFX/PDF.

2. Qualidade de dados:
- Fortalecer deduplicacao por assinatura de transacao.
- Exibir claramente linhas ignoradas e motivo.

3. UX:
- Melhorar mapeamento automatico de colunas.
- Exibir preview confiavel antes do commit.
- Mensagens de erro mais objetivas por etapa.

4. Seguranca:
- Limites de tamanho e quantidade de linhas no upload.
- Validacao de payloads no parse/commit.

5. Testes:
- Casos reais de importacao (bancos BR).
- Reimportacao do mesmo arquivo sem duplicar transacoes.
- Rejeicao de payload invalido e upload fora do limite.

### Criterio de pronto (DoD)

- `npm run verify` passa.
- `npm run test` passa.
- `npm run build` passa.
- Fluxo de importacao valido ponta a ponta com fixture realista.
- Reimportacao nao cria duplicatas.

### Notas de release 1.0.1

- Confiabilidade de parser ampliada para CSV com diagnostico por linha (`ok`, `ignored`, `error`) e motivos agregados.
- Fallback seguro para OFX/PDF com retorno amigavel e padrao (`supported: false`, `phase: "parse"`).
- Deduplicacao reforcada no commit com assinatura estavel (data normalizada UTC, valor normalizado, descricao, conta, origem e `externalId`).
- Respostas de erro 4xx padronizadas com `{ error, code, details? }`.
- Wizard de importacao atualizado com confianca de auto-mapeamento, preview por status e resumo final com `duplicadas` e `invalidas`.
- Observabilidade adicionada com logs estruturados por etapa: `import.parse`, `import.mapping` e `import.commit`.
