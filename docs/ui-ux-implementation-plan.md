# Plano Separado de UI/UX

Este documento registra a frente visual do produto para implementacao posterior. A execucao tecnica atual nao deve alterar layout, navegacao, identidade visual ou microcopy sem aprovacao explicita.

## Escopo Bloqueado Ate Aprovacao

### 1. Navegacao por periodo
- Adicionar seletor de mes ou intervalo em dashboard, categorias e relatorios.
- Tornar explicito quando a tela mostra mes corrente, ultimo mes com dados ou periodo customizado.

### 2. Cards orientados a decisao
- Card "Quanto posso gastar ainda".
- Card "Fechamento previsto do mes".
- Card "Gasto acima ou abaixo da media".
- Card "Qualidade dos dados" com pendencias de conciliacao e categorizacao.

### 3. Revisao dos graficos principais
- Separar gasto real, saida de caixa, cartao de credito e estornos.
- Evitar misturar competencia, cobranca e fluxo de caixa no mesmo agregado visual.

### 4. Novas visualizacoes
- Fluxo de caixa real com saldo inicial e saldo final.
- Comparativo mensal por categoria.
- Evolucao de gastos por categoria ao longo do tempo.
- Gasto fixo vs variavel com regra clara.

### 5. Indicadores operacionais
- Transacoes sem categoria.
- Importacoes com revisao pendente.
- Possiveis duplicidades.
- Contas ou fontes com baixa confiabilidade de conciliacao.

### 6. Ajustes de linguagem e conceito
- Corrigir rotulos enganosos.
- Explicitar quando um numero representa caixa, competencia, fatura ou patrimonio.

## Entregaveis Esperados
- Novo fluxo visual aprovado externamente.
- Especificacao de componentes e estados.
- Regras de exibicao por contexto financeiro.
- Mapeamento de telas que precisarao ser alteradas na implementacao.

## Dependencias Tecnicas
- Padronizacao do calculo oficial em cima do ledger.
- Contrato unico para refund e estorno.
- Importacao e reconciliacao sem ambiguidades.
- Categoria sem campos fantasmas na interface.
