import { matchesRule, type CategorizationRule } from "@/lib/categorizationRules";
import type { CanonicalImportRow } from "@/lib/import-canonical";
import { extractMerchantDescriptor, looksLikePersonName, normalizeImportTextForMatch } from "@/lib/import-text";

export type DeterministicCategorySource =
  | "user_rule"
  | "seeded_rule"
  | "history"
  | "builtin_rule"
  | "fallback"
  | "none";

export type DeterministicConfidence = "high" | "medium" | "low" | "none";

export type DeterministicCategorizationResult = {
  categoryId: string | null;
  categorySource: DeterministicCategorySource;
  confidence: DeterministicConfidence;
  shouldReview: boolean;
  reason: string | null;
  merchantKey: string;
  matchedRule: {
    id?: string;
    name: string;
    type: "user_rule" | "seeded_rule" | "builtin_rule" | "fallback" | "history";
  } | null;
};

type CategoryRef = {
  id: string;
  name: string;
};

export type CategorizationHistorySample = {
  merchantKey?: string | null;
  description?: string | null;
  categoryId: string;
  categorySource?: string | null;
  weight?: number | null;
};

type CategorizeInput = {
  row: CanonicalImportRow;
  accountId?: string | null;
  userRules: CategorizationRule[];
  categories: CategoryRef[];
  history?: CategorizationHistorySample[];
};

type BuiltinRule = {
  id: string;
  name: string;
  categoryAliases: string[];
  confidence: DeterministicConfidence;
  reason: string;
  match: (signals: CategorizationSignals) => boolean;
};

type RuleEvaluation = {
  rule: CategorizationRule;
  specificity: number;
};

type CategorizationSignals = {
  combinedNorm: string;
  transactionKindNorm: string;
  counterpartyNorm: string;
  merchantKey: string;
  merchantTokens: string[];
  processorTokens: string[];
  processorOnly: boolean;
  merchantAmbiguous: boolean;
  personLikeCounterparty: boolean;
  isIncome: boolean;
  isExpense: boolean;
  isTransferHint: boolean;
  isCardPayment: boolean;
  isBankFee: boolean;
  isRefundOrCashback: boolean;
  isSalary: boolean;
  isInvestment: boolean;
};

type HistoryAggregate = {
  merchantKey: string;
  totalWeight: number;
  observationCount: number;
  categoryWeights: Map<string, number>;
  topCategoryId: string;
  topCategoryWeight: number;
  topShare: number;
  firstToken: string;
  prefix: string;
  tokenSet: Set<string>;
  trigramSet: Set<string>;
};

type HistoryIndex = {
  byMerchantKey: Map<string, HistoryAggregate>;
  candidates: HistoryAggregate[];
};

type HistoryEvaluation =
  | {
      kind: "match";
      aggregate: HistoryAggregate;
      confidence: DeterministicConfidence;
    }
  | {
      kind: "conflict";
      aggregate: HistoryAggregate;
    }
  | null;

const historyIndexCache = new WeakMap<CategorizationHistorySample[], HistoryIndex>();

const GENERIC_SEEDED_RULE_TOKENS = new Set([
  "MERCADO",
  "PADARIA",
  "RESTAURANTE",
  "LOJA",
  "FARMACIA",
  "SERVICO",
  "SEGURO",
  "COMERCIO",
  "COMPRA",
  "VIVO",
  "CLARO",
  "TIM"
]);

const TRUSTED_BRAND_TOKENS = new Set([
  "IFOOD",
  "UBER",
  "UBEREATS",
  "99",
  "NETFLIX",
  "SPOTIFY",
  "CARREFOUR",
  "ATACADAO",
  "ASSAI",
  "IPIRANGA",
  "SHELL",
  "ENEL",
  "SABESP",
  "UNIMED",
  "DROGARAIA",
  "DROGASIL",
  "PAGUEMENOS",
  "YOUTUBE",
  "AMAZON",
  "APPLE",
  "GOOGLEPLAY"
]);

const HIGH_CONFIDENCE_BUILTIN_RULES: BuiltinRule[] = [
  {
    id: "builtin.bank-fee",
    name: "Taxa/encargo bancario",
    categoryAliases: ["TAXAS E ENCARGOS", "TAXAS", "ENCARGOS", "TARIFA"],
    confidence: "high",
    reason: "Lancamento identificado como tarifa, juros, multa ou IOF.",
    match: (signals) => signals.isExpense && signals.isBankFee
  },
  {
    id: "builtin.card-payment",
    name: "Pagamento de cartao/fatura",
    categoryAliases: ["TRANSFERENCIAS", "TRANSFERÊNCIAS", "TRANSFERENCIA", "TRANSFERÊNCIA"],
    confidence: "high",
    reason: "Lancamento identificado como pagamento de cartao ou fatura.",
    match: (signals) => signals.isCardPayment
  },
  {
    id: "builtin.pix-transfer",
    name: "Transferencia por PIX/TED/DOC",
    categoryAliases: ["TRANSFERENCIAS", "TRANSFERÊNCIAS", "TRANSFERENCIA", "TRANSFERÊNCIA"],
    confidence: "high",
    reason: "Lancamento identificado como transferencia entre pessoas ou contas.",
    match: (signals) =>
      signals.isTransferHint &&
      (signals.personLikeCounterparty || signals.processorOnly || signals.merchantKey === "transacao")
  },
  {
    id: "builtin.salary",
    name: "Renda recorrente",
    categoryAliases: ["RENDA", "RECEITAS", "RECEITA", "SALARIO", "SALÁRIO"],
    confidence: "high",
    reason: "Lancamento identificado como salario, provento ou folha.",
    match: (signals) => signals.isIncome && signals.isSalary
  },
  {
    id: "builtin.investment",
    name: "Movimentacao de investimento",
    categoryAliases: ["INVESTIMENTOS", "INVESTIMENTO"],
    confidence: "high",
    reason: "Lancamento identificado como aporte, corretora ou aplicacao.",
    match: (signals) => signals.isInvestment
  }
];

const MEDIUM_CONFIDENCE_BUILTIN_RULES: BuiltinRule[] = [
  {
    id: "builtin.subscription",
    name: "Assinatura digital",
    categoryAliases: ["ASSINATURAS", "ASSINATURA"],
    confidence: "high",
    reason: "Merchant identificado como assinatura ou streaming.",
    match: (signals) =>
      !signals.processorOnly &&
      hasMerchantToken(signals, [
        "NETFLIX",
        "SPOTIFY",
        "YOUTUBE",
        "AMAZON",
        "PRIMEVIDEO",
        "APPLE",
        "GOOGLEPLAY",
        "DEEZER",
        "DISNEY",
        "GLOBOPLAY"
      ])
  },
  {
    id: "builtin.delivery",
    name: "Alimentacao/delivery",
    categoryAliases: ["RESTAURANTES", "RESTAURANTE", "ALIMENTACAO", "ALIMENTAÇÃO"],
    confidence: "medium",
    reason: "Merchant identificado como restaurante, delivery ou padaria.",
    match: (signals) =>
      !signals.processorOnly &&
      !hasMerchantToken(signals, ["MERCADO", "SUPERMERCADO"]) &&
      (hasMerchantToken(signals, ["IFOOD", "UBEREATS", "RAPPI"]) ||
        hasMerchantToken(signals, [
          "RESTAURANTE",
          "LANCHONETE",
          "PIZZARIA",
          "BURGER",
          "PADARIA",
          "ACAI",
          "MCDONALDS",
          "SUBWAY"
        ]))
  },
  {
    id: "builtin.groceries",
    name: "Supermercado",
    categoryAliases: ["SUPERMERCADO", "MERCADO", "MERCADINHO"],
    confidence: "medium",
    reason: "Merchant identificado como supermercado ou hortifruti.",
    match: (signals) =>
      !signals.processorOnly &&
      (hasMerchantToken(signals, [
        "SUPERMERCADO",
        "MERCADO",
        "MERCADINHO",
        "HORTIFRUTI",
        "ATACADAO",
        "ASSAI",
        "CARREFOUR",
        "EXTRA",
        "QUITANDA"
      ]) ||
        (signals.merchantTokens.includes("IFOOD") && signals.merchantTokens.includes("MERCADO")))
  },
  {
    id: "builtin.transport",
    name: "Transporte urbano",
    categoryAliases: ["TRANSPORTE"],
    confidence: "medium",
    reason: "Merchant identificado como mobilidade ou corrida.",
    match: (signals) =>
      !signals.processorOnly &&
      hasMerchantToken(signals, ["UBER", "99", "CABIFY", "SEMPARAR", "ESTACIONAMENTO", "PEDAGIO"])
  },
  {
    id: "builtin.fuel",
    name: "Combustivel",
    categoryAliases: ["COMBUSTIVEL", "COMBUSTÍVEL", "TRANSPORTE"],
    confidence: "medium",
    reason: "Merchant identificado como posto ou combustivel.",
    match: (signals) =>
      !signals.processorOnly &&
      hasMerchantToken(signals, ["POSTO", "IPIRANGA", "SHELL", "COMBUSTIVEL", "GASOLINA"])
  },
  {
    id: "builtin.health",
    name: "Farmacia/saude",
    categoryAliases: ["SAUDE", "SAÚDE", "FARMACIA", "FARMÁCIA"],
    confidence: "medium",
    reason: "Merchant identificado como farmacia ou servico de saude.",
    match: (signals) =>
      !signals.processorOnly &&
      hasMerchantToken(signals, [
        "FARMACIA",
        "DROGARIA",
        "DROGARAIA",
        "DROGASIL",
        "PAGUEMENOS",
        "UNIMED",
        "CLINICA",
        "HOSPITAL"
      ])
  },
  {
    id: "builtin.utilities",
    name: "Utilidades",
    categoryAliases: ["UTILIDADES", "UTILIDADE", "INTERNET", "TELEFONE"],
    confidence: "medium",
    reason: "Merchant identificado como conta de consumo, internet ou telefonia.",
    match: (signals) =>
      !signals.processorOnly &&
      hasMerchantToken(signals, [
        "ENEL",
        "SABESP",
        "VIVO",
        "CLARO",
        "TIM",
        "INTERNET",
        "ENERGIA",
        "AGUA",
        "GAS"
      ])
  },
  {
    id: "builtin.refund",
    name: "Reembolso/estorno",
    categoryAliases: ["RENDA", "RECEITAS", "RECEITA", "REEMBOLSO"],
    confidence: "medium",
    reason: "Lancamento identificado como estorno, reembolso ou cashback.",
    match: (signals) => signals.isIncome && signals.isRefundOrCashback
  }
];

function hasMerchantToken(signals: CategorizationSignals, tokens: string[]): boolean {
  return tokens.some((token) => signals.merchantTokens.includes(token));
}

function normalizeCategoryName(value: string): string {
  return normalizeImportTextForMatch(value);
}

function resolveCategoryIdByAliases(categories: CategoryRef[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeCategoryName);

  for (const category of categories) {
    const normalizedCategory = normalizeCategoryName(category.name);

    if (
      normalizedAliases.some(
        (alias) => normalizedCategory.includes(alias) || alias.includes(normalizedCategory)
      )
    ) {
      return category.id;
    }
  }

  return null;
}

function normalizeRulePattern(value: string): string {
  return normalizeImportTextForMatch(value);
}

function ruleSpecificity(rule: CategorizationRule): number {
  const normalizedPattern = normalizeRulePattern(rule.pattern);
  const tokens = normalizedPattern.split(" ").filter(Boolean);
  return normalizedPattern.length + tokens.length * 6;
}

function isSeededRule(rule: CategorizationRule): boolean {
  return rule.name.trim().toUpperCase().startsWith("AUTO:");
}

function isTrustedSeededRule(rule: CategorizationRule, signals: CategorizationSignals): boolean {
  if (signals.processorOnly) return false;

  const normalizedPattern = normalizeRulePattern(rule.pattern);
  const tokens = normalizedPattern.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length >= 2) return true;

  const [token] = tokens;
  if (!token) return false;
  if (TRUSTED_BRAND_TOKENS.has(token)) return true;
  if (GENERIC_SEEDED_RULE_TOKENS.has(token)) return false;
  return token.length >= 8;
}

function evaluateRuleSet(
  rules: CategorizationRule[],
  row: CanonicalImportRow,
  signals: CategorizationSignals,
  accountId?: string | null
): RuleEvaluation[] {
  const description = [
    row.description,
    row.transactionKindRaw,
    row.counterpartyRaw,
    signals.merchantKey
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedDescription = normalizeImportTextForMatch(description);

  return rules
    .filter((rule) =>
      matchesRule(rule, {
        description,
        normalizedDescription,
        amount: row.amount,
        accountId: accountId ?? row.accountId
      })
    )
    .map((rule) => ({
      rule,
      specificity: ruleSpecificity(rule)
    }))
    .sort((left, right) => {
      if (left.rule.priority !== right.rule.priority) {
        return left.rule.priority - right.rule.priority;
      }
      return right.specificity - left.specificity;
    });
}

function buildSignals(row: CanonicalImportRow): CategorizationSignals {
  const merchant = extractMerchantDescriptor(row.counterpartyRaw || row.description);
  const combinedNorm = normalizeImportTextForMatch(
    `${row.description} ${row.transactionKindRaw} ${row.counterpartyRaw}`
  );
  const transactionKindNorm = row.transactionKindNorm || normalizeImportTextForMatch(row.transactionKindRaw);
  const counterpartyNorm = row.counterpartyNorm || normalizeImportTextForMatch(row.counterpartyRaw);
  const isIncome = row.amount >= 0 || row.type === "income";
  const isExpense = row.amount < 0 || row.type === "expense";
  const isTransferHint =
    /\b(?:PIX|TED|DOC|TRANSFER|TRANSFERENCIA|TRANSFERÊNCIA|BOLETO)\b/.test(combinedNorm) &&
    !/\b(?:SALARIO|SALÁRIO|PROVENTO|FOLHA)\b/.test(combinedNorm);
  const isCardPayment =
    /\b(?:PAGAMENTO|PAGTO|PGTO)\b/.test(combinedNorm) &&
    /\b(?:FATURA|CARTAO|CARTÃO)\b/.test(combinedNorm);
  const isBankFee = /\b(?:TARIFA|JUROS|IOF|MULTA|MORA|ENCARGO|ANUIDADE)\b/.test(combinedNorm);
  const isRefundOrCashback =
    /\b(?:ESTORNO|REEMBOLSO|REEMBOLSO|DEVOLUCAO|DEVOLUÇÃO|CASHBACK|REFUND|REVERSAL)\b/.test(
      combinedNorm
    );
  const isSalary =
    /\b(?:SALARIO|SALÁRIO|PROVENTO|FOLHA|PAYROLL|PRO LABORE|REMUNERACAO|REMUNERAÇÃO)\b/.test(
      combinedNorm
    );
  const isInvestment =
    /\b(?:INVEST|CDB|TESOURO|CORRETORA|RENDA FIXA|FII|ETF|ACOES|AÇÕES)\b/.test(combinedNorm);

  return {
    combinedNorm,
    transactionKindNorm,
    counterpartyNorm,
    merchantKey: merchant.merchantKey,
    merchantTokens: merchant.merchantTokens,
    processorTokens: merchant.processorTokens,
    processorOnly: merchant.processorOnly,
    merchantAmbiguous: merchant.ambiguous,
    personLikeCounterparty: looksLikePersonName(row.counterpartyRaw),
    isIncome,
    isExpense,
    isTransferHint,
    isCardPayment,
    isBankFee,
    isRefundOrCashback,
    isSalary,
    isInvestment
  };
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(" ").filter(Boolean));
}

function trigramSet(value: string): Set<string> {
  const padded = `  ${value}  `;
  const grams = new Set<string>();

  for (let index = 0; index < padded.length - 2; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }

  return grams;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function historyWeight(sample: CategorizationHistorySample): number {
  if (Number.isFinite(sample.weight)) {
    return Math.max(0.5, Number(sample.weight));
  }

  const source = String(sample.categorySource ?? "").trim().toLowerCase();
  if (source === "manual") return 4;
  if (source === "user_rule") return 3;
  if (source === "history") return 2.5;
  if (source === "seeded_rule" || source === "builtin_rule" || source === "fallback") return 1;
  return 2;
}

function buildHistoryIndex(history: CategorizationHistorySample[]): HistoryIndex {
  const cached = historyIndexCache.get(history);
  if (cached) {
    return cached;
  }

  const aggregated = new Map<
    string,
    {
      totalWeight: number;
      observationCount: number;
      categoryWeights: Map<string, number>;
    }
  >();

  for (const sample of history) {
    const merchantKey = (sample.merchantKey || "").trim().toLowerCase();
    if (!merchantKey || merchantKey === "transacao" || !sample.categoryId) continue;

    const current = aggregated.get(merchantKey) ?? {
      totalWeight: 0,
      observationCount: 0,
      categoryWeights: new Map<string, number>()
    };
    const weight = historyWeight(sample);

    current.totalWeight += weight;
    current.observationCount += 1;
    current.categoryWeights.set(
      sample.categoryId,
      (current.categoryWeights.get(sample.categoryId) ?? 0) + weight
    );
    aggregated.set(merchantKey, current);
  }

  const byMerchantKey = new Map<string, HistoryAggregate>();
  const candidates: HistoryAggregate[] = [];

  for (const [merchantKey, info] of aggregated.entries()) {
    const topCategory = [...info.categoryWeights.entries()].sort((left, right) => right[1] - left[1])[0];
    if (!topCategory) continue;

    const firstToken = merchantKey.split(" ").filter(Boolean)[0] ?? merchantKey.slice(0, 3);
    const aggregate: HistoryAggregate = {
      merchantKey,
      totalWeight: info.totalWeight,
      observationCount: info.observationCount,
      categoryWeights: info.categoryWeights,
      topCategoryId: topCategory[0],
      topCategoryWeight: topCategory[1],
      topShare: info.totalWeight > 0 ? topCategory[1] / info.totalWeight : 0,
      firstToken,
      prefix: merchantKey.slice(0, 3),
      tokenSet: tokenSet(merchantKey),
      trigramSet: trigramSet(merchantKey)
    };

    byMerchantKey.set(merchantKey, aggregate);
    candidates.push(aggregate);
  }

  const index = {
    byMerchantKey,
    candidates
  };
  historyIndexCache.set(history, index);
  return index;
}

function evaluateExactHistory(
  signals: CategorizationSignals,
  history?: CategorizationHistorySample[]
): HistoryEvaluation {
  if (!history || history.length === 0 || !signals.merchantKey || signals.merchantKey === "transacao") {
    return null;
  }

  const aggregate = buildHistoryIndex(history).byMerchantKey.get(signals.merchantKey);
  if (!aggregate) {
    return null;
  }

  if (aggregate.totalWeight >= 4 && aggregate.topShare >= 0.8) {
    return {
      kind: "match",
      aggregate,
      confidence: aggregate.topShare >= 0.9 ? "high" : "medium"
    };
  }

  if (aggregate.totalWeight >= 2.5 && aggregate.topShare >= 0.7) {
    return {
      kind: "match",
      aggregate,
      confidence: "medium"
    };
  }

  return {
    kind: "conflict",
    aggregate
  };
}

function evaluateSimilarHistory(
  signals: CategorizationSignals,
  history?: CategorizationHistorySample[]
): HistoryEvaluation {
  if (
    !history ||
    history.length === 0 ||
    !signals.merchantKey ||
    signals.merchantKey === "transacao" ||
    signals.processorOnly
  ) {
    return null;
  }

  const index = buildHistoryIndex(history);
  const firstToken = signals.merchantKey.split(" ").filter(Boolean)[0] ?? signals.merchantKey.slice(0, 3);
  const prefix = signals.merchantKey.slice(0, 3);
  const queryTokens = tokenSet(signals.merchantKey);
  const queryTrigrams = trigramSet(signals.merchantKey);

  let best: { aggregate: HistoryAggregate; score: number } | null = null;

  for (const candidate of index.candidates) {
    if (candidate.merchantKey === signals.merchantKey) continue;
    if (candidate.totalWeight < 4 || candidate.topShare < 0.85) continue;
    if (candidate.firstToken !== firstToken && candidate.prefix !== prefix) continue;

    const score = jaccard(queryTokens, candidate.tokenSet) * 0.6 + jaccard(queryTrigrams, candidate.trigramSet) * 0.4;
    if (score < 0.84) continue;

    if (!best || score > best.score) {
      best = {
        aggregate: candidate,
        score
      };
    }
  }

  if (!best) {
    return null;
  }

  return {
    kind: "match",
    aggregate: best.aggregate,
    confidence: best.score >= 0.92 ? "high" : "medium"
  };
}

function makeResult(input: {
  categoryId: string | null;
  categorySource: DeterministicCategorySource;
  confidence: DeterministicConfidence;
  reason: string | null;
  merchantKey: string;
  matchedRule?: DeterministicCategorizationResult["matchedRule"];
}): DeterministicCategorizationResult {
  return {
    categoryId: input.categoryId,
    categorySource: input.categorySource,
    confidence: input.confidence,
    shouldReview: input.categoryId === null || input.confidence === "low" || input.confidence === "none",
    reason: input.reason,
    merchantKey: input.merchantKey || "transacao",
    matchedRule: input.matchedRule ?? null
  };
}

function evaluateExplicitUserRules(
  row: CanonicalImportRow,
  userRules: CategorizationRule[],
  signals: CategorizationSignals,
  accountId?: string | null
): DeterministicCategorizationResult | null {
  const explicitRules = userRules.filter((rule) => !isSeededRule(rule));
  const matches = evaluateRuleSet(explicitRules, row, signals, accountId);
  const best = matches[0];
  if (!best) return null;

  return makeResult({
    categoryId: best.rule.categoryId,
    categorySource: "user_rule",
    confidence: "high",
    reason: `Regra manual aplicada: ${best.rule.name}.`,
    merchantKey: signals.merchantKey,
    matchedRule: {
      id: best.rule.id,
      name: best.rule.name,
      type: "user_rule"
    }
  });
}

function evaluateSeededRules(
  row: CanonicalImportRow,
  userRules: CategorizationRule[],
  signals: CategorizationSignals,
  accountId?: string | null
): DeterministicCategorizationResult | null {
  const seededRules = userRules.filter((rule) => isSeededRule(rule) && isTrustedSeededRule(rule, signals));
  const matches = evaluateRuleSet(seededRules, row, signals, accountId);
  const best = matches[0];
  if (!best) return null;

  const runnerUp = matches[1];
  if (
    runnerUp &&
    runnerUp.rule.categoryId !== best.rule.categoryId &&
    Math.abs(runnerUp.specificity - best.specificity) <= 3 &&
    Math.abs(runnerUp.rule.priority - best.rule.priority) <= 20
  ) {
    return null;
  }

  const confidence = best.specificity >= 20 ? "high" : "medium";

  return makeResult({
    categoryId: best.rule.categoryId,
    categorySource: "seeded_rule",
    confidence,
    reason: `Regra base aplicada: ${best.rule.name}.`,
    merchantKey: signals.merchantKey,
    matchedRule: {
      id: best.rule.id,
      name: best.rule.name,
      type: "seeded_rule"
    }
  });
}

function evaluateBuiltinRules(
  categories: CategoryRef[],
  signals: CategorizationSignals,
  rules: BuiltinRule[]
): DeterministicCategorizationResult | null {
  for (const rule of rules) {
    if (!rule.match(signals)) continue;

    const categoryId = resolveCategoryIdByAliases(categories, rule.categoryAliases);
    if (!categoryId) continue;

    return makeResult({
      categoryId,
      categorySource: "builtin_rule",
      confidence: rule.confidence,
      reason: rule.reason,
      merchantKey: signals.merchantKey,
      matchedRule: {
        id: rule.id,
        name: rule.name,
        type: "builtin_rule"
      }
    });
  }

  return null;
}

function evaluateHistoryMatch(
  signals: CategorizationSignals,
  history: HistoryEvaluation
): DeterministicCategorizationResult | null {
  if (!history || history.kind !== "match") {
    return null;
  }

  return makeResult({
    categoryId: history.aggregate.topCategoryId,
    categorySource: "history",
    confidence: history.confidence,
    reason: `Historico consistente para merchant ${history.aggregate.merchantKey}.`,
    merchantKey: signals.merchantKey,
    matchedRule: {
      name: `Historico: ${history.aggregate.merchantKey}`,
      type: "history"
    }
  });
}

export function categorizeImportRowDeterministic(input: CategorizeInput): DeterministicCategorizationResult {
  const signals = buildSignals(input.row);
  const exactHistory = evaluateExactHistory(signals, input.history);

  const explicitUserRule = evaluateExplicitUserRules(
    input.row,
    input.userRules,
    signals,
    input.accountId
  );
  if (explicitUserRule) {
    return explicitUserRule;
  }

  const exactHistoryMatch = evaluateHistoryMatch(signals, exactHistory);
  if (exactHistoryMatch) {
    return exactHistoryMatch;
  }

  const highBuiltin = evaluateBuiltinRules(input.categories, signals, HIGH_CONFIDENCE_BUILTIN_RULES);
  if (highBuiltin) {
    return highBuiltin;
  }

  const similarHistory = evaluateSimilarHistory(signals, input.history);
  const similarHistoryMatch = evaluateHistoryMatch(signals, similarHistory);
  if (similarHistoryMatch) {
    return similarHistoryMatch;
  }

  if (exactHistory?.kind !== "conflict") {
    const seededRule = evaluateSeededRules(input.row, input.userRules, signals, input.accountId);
    if (seededRule) {
      return seededRule;
    }

    const mediumBuiltin = evaluateBuiltinRules(input.categories, signals, MEDIUM_CONFIDENCE_BUILTIN_RULES);
    if (mediumBuiltin) {
      return mediumBuiltin;
    }
  }

  if (exactHistory?.kind === "conflict") {
    return makeResult({
      categoryId: null,
      categorySource: "none",
      confidence: "none",
      reason: `Historico conflitante para merchant ${exactHistory.aggregate.merchantKey}; revisar manualmente.`,
      merchantKey: signals.merchantKey
    });
  }

  if (signals.processorOnly) {
    return makeResult({
      categoryId: null,
      categorySource: "none",
      confidence: "none",
      reason: `Descricao dominada por intermediador de pagamento (${signals.processorTokens.join(", ").toLowerCase()}); sem contexto suficiente.`,
      merchantKey: signals.merchantKey
    });
  }

  if (signals.merchantAmbiguous) {
    return makeResult({
      categoryId: null,
      categorySource: "none",
      confidence: "low",
      reason: "Merchant ambíguo ou genérico; revisão manual recomendada.",
      merchantKey: signals.merchantKey
    });
  }

  return makeResult({
    categoryId: null,
    categorySource: "none",
    confidence: "none",
    reason: "Sem sinais suficientes para categorizar com segurança.",
    merchantKey: signals.merchantKey
  });
}
