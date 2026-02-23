import { normalizeDescription } from "@/lib/normalize";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";

type DefaultCategoryPreset = {
  name: string;
  color: string;
  icon: string;
  patterns: string[];
};

const DEFAULT_CATEGORY_PRESETS: DefaultCategoryPreset[] = [
  {
    name: "Moradia",
    color: "#f97316",
    icon: "Home",
    patterns: ["ALUGUEL", "CONDOMINIO", "IPTU"]
  },
  {
    name: "Supermercado",
    color: "#10b981",
    icon: "ShoppingCart",
    patterns: ["SUPERMERCADO", "MERCADO", "ATACADAO", "CARREFOUR", "EXTRA"]
  },
  {
    name: "Restaurantes",
    color: "#a855f7",
    icon: "UtensilsCrossed",
    patterns: ["IFOOD", "RESTAURANTE", "LANCHONETE", "PIZZARIA", "BURGER"]
  },
  {
    name: "Transporte",
    color: "#0ea5e9",
    icon: "Car",
    patterns: ["UBER", "99APP", "COMBUSTIVEL", "POSTO", "ESTACIONAMENTO"]
  },
  {
    name: "Utilidades",
    color: "#14b8a6",
    icon: "Zap",
    patterns: ["ENERGIA", "LUZ", "AGUA", "INTERNET", "VIVO FIBRA", "CLARO"]
  },
  {
    name: "Saude",
    color: "#ef4444",
    icon: "HeartPulse",
    patterns: ["FARMACIA", "DROGARIA", "HOSPITAL", "CLINICA", "UNIMED"]
  },
  {
    name: "Educacao",
    color: "#6366f1",
    icon: "GraduationCap",
    patterns: ["ESCOLA", "FACULDADE", "CURSO", "ALURA", "UDEMY"]
  },
  {
    name: "Assinaturas",
    color: "#8b5cf6",
    icon: "Repeat",
    patterns: ["NETFLIX", "SPOTIFY", "DISNEY", "GOOGLE ONE", "YOUTUBE PREMIUM"]
  },
  {
    name: "Transferencias",
    color: "#64748b",
    icon: "ArrowLeftRight",
    patterns: ["PIX RECEBIDO", "PIX ENVIADO", "TED", "DOC", "TRANSFERENCIA"]
  },
  {
    name: "Investimentos",
    color: "#22c55e",
    icon: "TrendingUp",
    patterns: ["INVESTIMENTO", "CDB", "TESOURO", "CORRETORA", "B3"]
  },
  {
    name: "Lazer",
    color: "#ec4899",
    icon: "PartyPopper",
    patterns: ["CINEMA", "SHOW", "TEATRO", "PARQUE"]
  },
  {
    name: "Renda",
    color: "#16a34a",
    icon: "Wallet",
    patterns: ["SALARIO", "PROVENTO", "FREELA", "RENDIMENTO"]
  }
];

function buildRuleIdentity(input: { pattern: string; categoryId: string }): string {
  return `${normalizeDescription(input.pattern)}|${input.categoryId}`;
}

export async function restoreDefaultCategoriesForUser(userId: string): Promise<{
  createdCategories: number;
  createdRules: number;
  totalCategories: number;
  totalRules: number;
}> {
  const existingCategories = await categoriesRepo.listByUser(userId);
  const categoryByName = new Map(existingCategories.map((item) => [normalizeDescription(item.name), item]));

  let createdCategories = 0;

  for (const preset of DEFAULT_CATEGORY_PRESETS) {
    const normalizedName = normalizeDescription(preset.name);
    if (categoryByName.has(normalizedName)) {
      continue;
    }

    const created = await categoriesRepo.create({
      userId,
      name: preset.name,
      color: preset.color,
      icon: preset.icon
    });

    if (created) {
      categoryByName.set(normalizedName, created);
      createdCategories += 1;
    }
  }

  const allRules = await categoryRulesRepo.listByUser(userId);
  const existingRuleIdentities = new Set(
    allRules.map((rule) => buildRuleIdentity({ pattern: rule.pattern, categoryId: rule.categoryId }))
  );

  let createdRules = 0;
  let nextPriority = Math.max(100, ...allRules.map((rule) => rule.priority), 0) + 10;

  for (const preset of DEFAULT_CATEGORY_PRESETS) {
    const category = categoryByName.get(normalizeDescription(preset.name));
    if (!category) continue;

    for (const pattern of preset.patterns) {
      const identity = buildRuleIdentity({ pattern, categoryId: category.id });
      if (existingRuleIdentities.has(identity)) {
        continue;
      }

      const created = await categoryRulesRepo.create({
        userId,
        name: `Auto: ${preset.name} - ${pattern}`,
        priority: nextPriority,
        enabled: true,
        matchType: "contains",
        pattern,
        categoryId: category.id
      });

      nextPriority += 10;

      if (created) {
        existingRuleIdentities.add(identity);
        createdRules += 1;
      }
    }
  }

  return {
    createdCategories,
    createdRules,
    totalCategories: (await categoriesRepo.listByUser(userId)).length,
    totalRules: (await categoryRulesRepo.listByUser(userId)).length
  };
}

