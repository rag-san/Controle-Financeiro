# Roadmap 1.0.1 - Importacao por Extrato

## Contexto

A versao 1.0.0 estabilizou base funcional e seguranca principal.  
A 1.0.1 vai focar em qualidade de importacao para reduzir retrabalho manual.

## Escopo

### P0 (must-have)

1. Robustez do parser de importacao
- CSV: delimitador, encoding, cabecalho inconsistente e colunas faltantes.
- OFX/PDF: fallback seguro quando parser nao reconhecer estrutura.

2. Deduplicacao confiavel
- Consolidar assinatura de transacao com campos estaveis:
  - data normalizada
  - valor normalizado
  - descricao normalizada
  - conta
  - tipo de origem
- Garantir idempotencia em reimportacao.

3. Validacao e seguranca do fluxo
- Limite de tamanho de arquivo.
- Limite de linhas por commit.
- Rejeicao de payload invalido com mensagens claras.

4. Testes de integracao focados em importacao
- CSV fixture realista de banco BR.
- Commit duplo do mesmo lote (sem duplicatas).
- Casos invalidos (arquivo vazio, campos invalidos, payload grande).

### P1 (next)

1. Melhorias de UX no wizard
- Auto-mapeamento de colunas com confianca.
- Preview com status por linha (ok, ignorada, erro).
- Resumo final: importadas, puladas, duplicadas.

2. Observabilidade
- Log de erros por etapa (`parse`, `mapping`, `commit`).
- Indicadores basicos de falha por tipo de arquivo.

### P2 (later)

1. Biblioteca de layouts por banco (PDF/CSV).
2. Regras inteligentes de mapeamento por historico do usuario.
3. Export de relatorio de importacao (CSV com erros/puladas).

## Fora de escopo da 1.0.1

- Migracao de banco (SQLite para Postgres).
- Reescrita de UI fora do wizard/importacao.
- Nova camada de autenticao.

## Plano de implementacao

1. Baseline de testes atuais e fixtures existentes.
2. Endurecer parse/commit e deduplicacao (backend primeiro).
3. Ajustar UX do wizard para refletir novos estados.
4. Cobrir com testes de integracao e smoke manual.
5. Validar build final e publicar `v1.0.1`.

## Criterios de aceite

1. Reimportar o mesmo extrato nao cria novas transacoes.
2. Arquivos invalidos retornam erro amigavel e consistente.
3. Importacao valida passa ponta a ponta com dados de exemplo.
4. `npm run verify`, `npm run test` e `npm run build` passando.

## Riscos e mitigacoes

1. Risco: parser de PDF falhar em layouts variados.  
Mitigacao: fallback explicito + mensagens claras + testes com multiplos fixtures.

2. Risco: falso positivo na deduplicacao (transacoes legitimas iguais).  
Mitigacao: incluir mais contexto na assinatura e validar com casos de borda.

3. Risco: regressao de performance em importacoes grandes.  
Mitigacao: limites de payload e processamento em lote com metricas.
