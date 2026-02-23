# Contrato Oficial de Metricas Financeiras

## Fonte oficial

- Endpoint canônico: `/api/metrics/official`
- Views suportadas:
  - `reports`
  - `cashflow`
  - `categories`
  - `dashboard`

## Regras de soma por tipo

1. `income`
- soma em receitas (`income`).
- nao soma em despesas.

2. `expense`
- soma em despesas (`expense`) pelo valor absoluto.
- nao soma em receitas.

3. `transfer`
- nao soma em receitas nem despesas.
- nao entra em agregacao de categorias.
- afeta saldo por conta (perna de saida negativa, perna de entrada positiva).

## Regras de importacao relevantes para metricas

1. `credit_card_invoice`
- linhas de compra devem ser roteadas para conta `type=credit`.

2. pagamento de fatura no extrato de conta corrente
- deve virar `transfer` (`checking/cash -> credit`) quando houver destino resolvido.

3. idempotencia de transferencia
- reimportacao nao pode criar apenas meia transferencia.
- hashes `OUT/IN` devem impedir par incompleto duplicado.

## Consistencia esperada

1. soma de categorias do periodo == total de despesas do periodo.
2. serie temporal consolidada == totais do mesmo periodo.
3. saldo por conta == soma historica das transacoes da conta.
