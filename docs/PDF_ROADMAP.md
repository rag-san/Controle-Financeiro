# Roadmap PDF por Banco

## Escopo atual (22/02/2026)

Parser de PDF habilitado apenas para layouts validados de:

- Banco Inter:
  - Extrato de conta corrente (`issuerProfile: inter_statement`)
  - Fatura de cartao (`issuerProfile: inter_invoice`)
- Mercado Pago:
  - Fatura (`issuerProfile: mercado_pago_invoice`)

Regra importante: nao usar parser generico para "adivinhar" qualquer layout.  
Para bancos nao reconhecidos, retornar erro estruturado e orientar CSV/OFX.

## Status (23/02/2026)

- [x] Erro estruturado para perfil de emissor nao suportado (`pdf_unsupported_issuer_profile`)
- [x] Testes unitarios de classificacao por emissor/layout (`tests/unit/pdf-classification.test.ts`)
- [ ] Adicionar novo banco com parser dedicado e fixture real

## Como adicionar suporte a um novo banco

1. Coletar amostras reais:
   - Pelo menos 3 PDFs reais por tipo (extrato/fatura), de meses diferentes.
   - Confirmar variacoes de layout e idioma.

2. Atualizar classificacao em `lib/pdf.ts`:
   - Incluir regra explicita em `classifyPdfDocument`.
   - Definir novo `issuerProfile` (ex.: `itau_statement`).

3. Criar parser dedicado:
   - Implementar `parse<Bank><Type>Transactions`.
   - Mapear data, descricao, valor, tipo (income/expense) e metadados uteis.

4. Registrar no fluxo principal:
   - Em `parsePdfImport`, adicionar branch explicita para o novo `issuerProfile`.
   - Manter bloqueio para `issuerProfile: unknown`.

5. Testar com fixture real:
   - Adicionar fixture em `Arquivosdeexemplo`.
   - Cobrir em `tests/integration/api-flow.test.mjs` com assercoes de:
     - `status`
     - `issuerProfile`
     - `documentType`
     - quantidade minima de linhas parseadas.

6. Observabilidade:
   - Validar logs `import.parse` para sucesso e falha.
   - Garantir que erros repetidos nao gerem spam de logs.

## Checklist rapido por banco novo

- [ ] Classificacao do banco adicionada
- [ ] Parser dedicado implementado
- [ ] Fluxo principal atualizado
- [ ] Teste de integracao com PDF real
- [ ] Mensagem de erro e documentacao atualizadas
