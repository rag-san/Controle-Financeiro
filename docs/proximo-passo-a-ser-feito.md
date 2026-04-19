# Proximo passo a ser feito

Data: 2026-04-19

Objetivo: melhorar a confianca do sistema nos valores importados, usando o saldo real do extrato como base para medir gasto, fluxo de caixa e saude financeira.

## 1. Saldo real como fonte de verdade

Prioridade: critica

- Persistir por conta o ultimo `balanceAfter` confirmado em importacoes de extrato. **Feito parcialmente:** snapshots de saldo confirmado sao gravados em `account_balance_snapshots` quando o extrato reconciliado possui anchors de saldo.
- Separar claramente saldo calculado por soma de transacoes e saldo confirmado pelo banco. **Feito parcialmente:** `/api/accounts` agora expoe `currentBalance` e `confirmedBalance` separadamente, incluindo a diferenca entre eles.
- Mostrar nas telas quando o saldo veio de extrato e quando e apenas estimado. **Feito parcialmente:** a tela de contas mostra saldo confirmado por banco/extrato, diferenca calculada e quando o saldo e apenas calculado.
- Criar validacao para alertar quando a soma das transacoes nao fecha com o saldo final importado. **Feito:** o commit rejeita extratos com `balanceAfter` inconsistente.

## 2. Datas sem erro de timezone

Prioridade: critica

- Padronizar datas financeiras como `dateKey` (`yyyy-MM-dd`) ou meio-dia UTC. **Feito parcialmente:** datas sem hora passam a ser normalizadas como meio-dia UTC no backend.
- Evitar `new Date("yyyy-MM-dd")` para datas de transacoes. **Feito parcialmente:** `parseFlexibleDate` trata `yyyy-MM-dd`, `dd/MM/yyyy`, `dd-MM-yyyy`, `dd.MM.yyyy` e `yyyyMMdd` como datas financeiras, sem depender do parser nativo.
- Ajustar exibicao no front para nao mover lancamentos para o dia anterior. **Feito parcialmente:** a listagem de transacoes renderiza datas com `timeZone: "UTC"`.
- Adicionar testes cobrindo datas em timezone Brasil. **Feito parcialmente:** ha testes para normalizacao em meio-dia UTC e para filtros customizados cobrirem o dia inteiro.

## 3. Mapeamento manual de CSV

Prioridade: alta

- Criar tela para mapear colunas quando o backend retornar `needsMapping`. **Feito:** o modal de importacao abre etapa de mapeamento para CSV.
- Permitir selecionar data, descricao, valor, debito, credito, tipo, conta e saldo. **Feito.**
- Mostrar amostra das linhas antes de confirmar o mapeamento. **Feito.**
- Salvar presets por banco/layout quando possivel. **Feito parcialmente:** o modal salva localmente o mapeamento por assinatura de colunas do CSV.

## 4. Contrato front/back da importacao

Prioridade: alta

- Completar o tipo `ImportCommitRow` no front com `externalId`, `transactionKindRaw`, `counterpartyRaw` e `merchantKey`. **Feito:** o tipo tambem inclui campos normalizados e IDs de transferencia.
- Garantir que o front apenas repasse os dados parseados pelo backend. **Feito parcialmente:** o modal preserva os campos parseados e altera apenas categoria/conta escolhida pelo usuario.
- Evitar qualquer normalizacao de valor no front alem de exibicao visual.
- Adicionar teste de contrato para parse -> preview -> commit. **Feito:** ha teste garantindo que as linhas do parse podem ser commitadas sem normalizacao de valor/data pelo front.

## 5. Unificar pipeline de importacao

Prioridade: alta

- Definir `/api/imports/parse` + `/api/imports/commit` como fluxo oficial.
- Revisar a rota antiga `/api/import`, que importa direto no ledger. **Feito:** a rota legada foi desativada.
- Depreciar ou adaptar a rota antiga para nao criar divergencia entre `transactions` e `ledger`. **Feito:** `/api/import` retorna `410 legacy_import_route_disabled` apontando para parse/commit.
- Documentar o fluxo oficial de importacao. **Feito parcialmente:** este plano registra `/api/imports/parse` + `/api/imports/commit` como caminho oficial.

## 6. Melhorias de UX no preview

Prioridade: media

- Trocar o texto "saldo" no preview por "resultado do arquivo". **Feito.**
- Exibir tambem o saldo final do extrato quando houver `closingBalance` ou ultimo `balanceAfter`. **Feito.**
- Indicar linhas sem categoria como pendentes de revisao, sem bloquear importacao.
- Diferenciar visualmente receita, despesa, transferencia e pagamento de fatura. **Feito parcialmente:** o preview diferencia entrada, saida, transferencia e compra no cartao.

## 7. Auditoria automatica de valores

Prioridade: media

- Expandir `db:health` para verificar tipo vs sinal, ledger sem espelho e saldo divergente. **Feito:** `db:health` agora verifica sinal/tipo, transferencias sem par, divergencia com saldo confirmado e pagamentos de fatura salvos como despesa comum.
- Criar endpoint ou script de auditoria por usuario/conta. **Feito parcialmente:** o script `db:health` cobre auditoria global; endpoint por usuario/conta fica como evolucao.
- Comparar totais de `transactions`, `ledger_entries` e saldos confirmados. **Feito parcialmente:** o script compara saldo calculado de `transactions` com saldos confirmados.
- Gerar alertas quando fatura de cartao for importada como despesa duplicada no caixa. **Feito parcialmente:** `db:health` alerta pagamentos de fatura no caixa salvos como despesa comum.

## Ordem recomendada

1. Corrigir datas e contrato front/back.
2. Persistir saldo confirmado por extrato.
3. Criar mapeamento manual de CSV.
4. Unificar as rotas de importacao.
5. Melhorar preview e auditoria automatica.
