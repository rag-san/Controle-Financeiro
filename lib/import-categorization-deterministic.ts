import { matchesRule, type CategorizationRule } from "@/lib/categorizationRules";
import type { CanonicalImportRow } from "@/lib/import-canonical";
import { looksLikePersonName, normalizeImportTextForMatch } from "@/lib/import-text";

export type DeterministicCategorySource = "user_rule" | "builtin_rule" | "fallback" | "none";

export type DeterministicCategorizationResult = {
  categoryId: string | null;
  categorySource: DeterministicCategorySource;
  matchedRule: {
    id?: string;
    name: string;
    type: "user_rule" | "builtin_rule" | "fallback";
  } | null;
};

type CategoryRef = {
  id: string;
  name: string;
};

type CategorizeInput = {
  row: CanonicalImportRow;
  accountId?: string | null;
  userRules: CategorizationRule[];
  categories: CategoryRef[];
};

type BuiltinRule = {
  id: string;
  name: string;
  categoryAliases: string[];
  match: (row: CanonicalImportRow, combinedNorm: string) => boolean;
};

const BUILTIN_RULES: BuiltinRule[] = [
  {
    id: "builtin.supermercado",
    name: "Supermercado por destino",
    categoryAliases: ["SUPERMERCADO", "MERCADO", "MERCADINHO"],
    match: (_row, combinedNorm) => /\b(SUPERMERCADO|MERCADINHO|PAGUE)\b/.test(combinedNorm)
  },
  {
    id: "builtin.alimentacao",
    name: "Alimentacao por destino",
    categoryAliases: ["ALIMENTACAO", "ALIMENTAÇÃO", "RESTAURANTES", "RESTAURANTE"],
    match: (_row, combinedNorm) => /\b(PADARIA|LANCHES|ACAI|RESTAURANTE)\b/.test(combinedNorm)
  },
  {
    id: "builtin.combustivel_transporte",
    name: "Combustivel/Transporte por destino",
    categoryAliases: ["COMBUSTIVEL", "COMBUSTÍVEL", "TRANSPORTE"],
    match: (_row, combinedNorm) => /\b(POSTO|IPIRANGA|COMBUST)\b/.test(combinedNorm)
  },
  {
    id: "builtin.pix_pessoa",
    name: "Transferencias para pessoas",
    categoryAliases: ["TRANSFERENCIAS", "TRANSFERÊNCIAS", "PESSOAS"],
    match: (row, combinedNorm) =>
      /\bPIX\b/.test(combinedNorm) && looksLikePersonName(row.counterpartyRaw)
  }
];

const FALLBACK_FEE_REGEX = /\b(TARIFA|JUROS|IOF|MULTA|MORA)\b/;

function normalizeCategoryName(value: string): string {
  return normalizeImportTextForMatch(value);
}

function resolveCategoryIdByAliases(categories: CategoryRef[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeCategoryName);

  for (const category of categories) {
    const normalizedCategory = normalizeCategoryName(category.name);

    if (
      normalizedAliases.some(
        (alias) =>
          normalizedCategory.includes(alias) || alias.includes(normalizedCategory)
      )
    ) {
      return category.id;
    }
  }

  return null;
}

function evaluateUserRule(
  row: CanonicalImportRow,
  userRules: CategorizationRule[],
  accountId?: string | null
): DeterministicCategorizationResult | null {
  const orderedRules = [...userRules].sort((first, second) => first.priority - second.priority);
  const description = [row.description, row.transactionKindRaw, row.counterpartyRaw]
    .filter(Boolean)
    .join(" ");
  const normalizedDescription = normalizeImportTextForMatch(description);

  const matched = orderedRules.find((rule) =>
    matchesRule(rule, {
      description,
      normalizedDescription,
      amount: row.amount,
      accountId: accountId ?? row.accountId
    })
  );

  if (!matched) return null;

  return {
    categoryId: matched.categoryId,
    categorySource: "user_rule",
    matchedRule: {
      id: matched.id,
      name: matched.name,
      type: "user_rule"
    }
  };
}

function evaluateBuiltinRules(row: CanonicalImportRow, categories: CategoryRef[]): DeterministicCategorizationResult | null {
  const combinedNorm = normalizeImportTextForMatch(
    `${row.transactionKindRaw} ${row.counterpartyRaw}`
  );

  for (const rule of BUILTIN_RULES) {
    if (!rule.match(row, combinedNorm)) continue;

    const categoryId = resolveCategoryIdByAliases(categories, rule.categoryAliases);
    if (!categoryId) continue;

    return {
      categoryId,
      categorySource: "builtin_rule",
      matchedRule: {
        id: rule.id,
        name: rule.name,
        type: "builtin_rule"
      }
    };
  }

  return null;
}

function evaluateFallback(row: CanonicalImportRow, categories: CategoryRef[]): DeterministicCategorizationResult | null {
  const combinedNorm = normalizeImportTextForMatch(
    `${row.transactionKindRaw} ${row.counterpartyRaw}`
  );

  if (!FALLBACK_FEE_REGEX.test(combinedNorm)) {
    return null;
  }

  const categoryId = resolveCategoryIdByAliases(categories, ["TAXAS", "ENCARGOS", "TARIFA", "MULTA", "JUROS"]);
  if (!categoryId) {
    return {
      categoryId: null,
      categorySource: "none",
      matchedRule: null
    };
  }

  return {
    categoryId,
    categorySource: "fallback",
    matchedRule: {
      id: "fallback.taxas-encargos",
      name: "Fallback Taxas/Encargos",
      type: "fallback"
    }
  };
}

export function categorizeImportRowDeterministic(input: CategorizeInput): DeterministicCategorizationResult {
  const userMatch = evaluateUserRule(input.row, input.userRules, input.accountId);
  if (userMatch) return userMatch;

  const builtinMatch = evaluateBuiltinRules(input.row, input.categories);
  if (builtinMatch) return builtinMatch;

  const fallbackMatch = evaluateFallback(input.row, input.categories);
  if (fallbackMatch) return fallbackMatch;

  return {
    categoryId: null,
    categorySource: "none",
    matchedRule: null
  };
}

