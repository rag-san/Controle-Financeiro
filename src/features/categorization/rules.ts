import type { CategoryDTO, TransactionDTO } from "@/lib/types";
import { normalizeText } from "@/src/features/categorization/normalizeMerchant";

type SemanticCategory =
  | "transport"
  | "delivery"
  | "groceries"
  | "fuel"
  | "subscriptions"
  | "utilities"
  | "internet_phone";

type RuleDefinition = {
  id: string;
  semanticCandidates: SemanticCategory[];
  priority: number;
  confidence: number;
  reason: string;
  keywords: string[];
  patterns?: RegExp[];
};

export type CategoryRule = {
  id: string;
  categoryId: string;
  priority: number;
  specificity: number;
  confidence: number;
  match: (transaction: TransactionDTO, merchantKey: string) => boolean;
  reason: string;
};

const CATEGORY_KEYWORDS_BY_SEMANTIC: Record<SemanticCategory, string[]> = {
  transport: ["transporte", "mobilidade", "taxi", "uber", "99", "locomocao", "transit"],
  delivery: ["delivery", "ifood", "rappi", "uber eats", "restaurante", "alimentacao", "food"],
  groceries: ["supermercado", "mercado", "compras", "groceries", "carrefour", "extra"],
  fuel: ["combustivel", "gasolina", "posto", "fuel", "ipiranga", "shell"],
  subscriptions: ["assinatura", "subscriptions", "streaming", "netflix", "spotify", "prime"],
  utilities: ["energia", "luz", "utilities", "contas", "cemig", "enel"],
  internet_phone: ["internet", "telefone", "celular", "telecom", "phone", "vivo", "claro", "tim"]
};

const BASE_RULE_DEFINITIONS: RuleDefinition[] = [
  {
    id: "transport_uber_99_taxi",
    semanticCandidates: ["transport"],
    priority: 100,
    confidence: 0.93,
    reason: "Regra: transporte por Uber/99/Taxi",
    keywords: ["uber", "99", "taxi", "cabify"]
  },
  {
    id: "delivery_ifood_rappi",
    semanticCandidates: ["delivery"],
    priority: 96,
    confidence: 0.92,
    reason: "Regra: delivery (iFood/Uber Eats/Rappi)",
    keywords: ["ifood", "uber eats", "rappi", "delivery"]
  },
  {
    id: "groceries_market",
    semanticCandidates: ["groceries"],
    priority: 95,
    confidence: 0.9,
    reason: "Regra: supermercado",
    keywords: ["supermercado", "carrefour", "extra", "atacadao", "mercado"],
    patterns: [/\bmercad[o|a]\b/, /\bsuper\s?mercado\b/]
  },
  {
    id: "fuel_stations",
    semanticCandidates: ["fuel"],
    priority: 94,
    confidence: 0.89,
    reason: "Regra: combustível/posto",
    keywords: ["shell", "ipiranga", "posto", "combustivel", "gasolina"],
    patterns: [/\bposto\b/, /\bcombust[íi]vel\b/]
  },
  {
    id: "subscriptions_streaming",
    semanticCandidates: ["subscriptions"],
    priority: 92,
    confidence: 0.87,
    reason: "Regra: assinatura/streaming",
    keywords: ["netflix", "spotify", "prime", "assinatura", "streaming"]
  },
  {
    id: "utilities_energy",
    semanticCandidates: ["utilities", "internet_phone"],
    priority: 91,
    confidence: 0.88,
    reason: "Regra: utilidades (energia/contas)",
    keywords: ["cemig", "enel", "energia", "luz"]
  },
  {
    id: "internet_phone",
    semanticCandidates: ["internet_phone", "utilities"],
    priority: 90,
    confidence: 0.86,
    reason: "Regra: internet/telefone",
    keywords: ["internet", "vivo", "claro", "tim", "telefone", "celular", "fibra", "telecom"]
  }
];

function resolveCategoryIdBySemantic(
  categoriesByNormalizedName: Map<string, string>,
  semantics: SemanticCategory[]
): string | null {
  for (const semantic of semantics) {
    const tokens = CATEGORY_KEYWORDS_BY_SEMANTIC[semantic];
    for (const token of tokens) {
      const exact = categoriesByNormalizedName.get(token);
      if (exact) {
        return exact;
      }
    }

    for (const [categoryName, categoryId] of categoriesByNormalizedName.entries()) {
      if (tokens.some((token) => categoryName.includes(token))) {
        return categoryId;
      }
    }
  }

  return null;
}

function createCategoriesIndex(categories: CategoryDTO[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const category of categories) {
    const normalizedName = normalizeText(category.name);
    if (!normalizedName) continue;
    index.set(normalizedName, category.id);
  }
  return index;
}

export function buildCategoryRules(categories: CategoryDTO[]): CategoryRule[] {
  const categoriesIndex = createCategoriesIndex(categories);

  return BASE_RULE_DEFINITIONS.flatMap((definition) => {
    const categoryId = resolveCategoryIdBySemantic(categoriesIndex, definition.semanticCandidates);
    if (!categoryId) return [];

    const keywords = definition.keywords.map((keyword) => normalizeText(keyword));
    const specificity = Math.max(...keywords.map((keyword) => keyword.length));

    return [
      {
        id: definition.id,
        categoryId,
        priority: definition.priority,
        specificity,
        confidence: definition.confidence,
        reason: definition.reason,
        match: (transaction: TransactionDTO, merchantKey: string) => {
          const haystack = `${merchantKey} ${normalizeText(transaction.description)}`;
          const keywordMatch = keywords.some((keyword) => haystack.includes(keyword));
          if (keywordMatch) return true;

          if (!definition.patterns || definition.patterns.length === 0) {
            return false;
          }

          return definition.patterns.some((pattern) => pattern.test(haystack));
        }
      }
    ];
  });
}

export function pickBestRuleMatch(
  transaction: TransactionDTO,
  merchantKey: string,
  rules: CategoryRule[]
): CategoryRule | null {
  const matches = rules.filter((rule) => rule.match(transaction, merchantKey));
  if (matches.length === 0) return null;

  matches.sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    if (left.specificity !== right.specificity) return right.specificity - left.specificity;
    return right.confidence - left.confidence;
  });

  return matches[0] ?? null;
}
