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
