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
    patterns: ["ALUGUEL", "ALUG", "CONDOMINIO", "CONDOM", "IPTU", "IMOBILIARIA", "FINANCIAMENTO IMOBILIARIO"]
  },
  {
    name: "Supermercado",
    color: "#10b981",
    icon: "ShoppingCart",
    patterns: [
      "SUPERMERCADO",
      "MERCADO",
      "ATACADAO",
      "CARREFOUR",
      "EXTRA",
      "MERCADINHO",
      "PAGUE M",
      "CASADECARNES",
      "AGROMIL",
      "ASSAI",
      "COOP",
      "SUPERMERCADOS",
      "HORTIFRUTI",
      "ATACAREJO",
      "QUITANDA"
    ]
  },
  {
    name: "Restaurantes",
    color: "#a855f7",
    icon: "UtensilsCrossed",
    patterns: [
      "IFOOD",
      "RESTAURANTE",
      "LANCHONETE",
      "PIZZARIA",
      "BURGER",
      "LANCHES",
      "ACAI",
      "MILKSHAKE",
      "SORVETE",
      "OGGI SORVETES",
      "IMPERIODOACAI",
      "PADARIA",
      "PASTELARIA",
      "CHURRASCARIA",
      "MCDONALD",
      "MC DONALD",
      "SUBWAY"
    ]
  },
  {
    name: "Transporte",
    color: "#0ea5e9",
    icon: "Car",
    patterns: [
      "UBER",
      "99APP",
      "99 POP",
      "COMBUSTIVEL",
      "POSTO",
      "ESTACIONAMENTO",
      "IPIRANGA",
      "SHELL",
      "SEM PARAR",
      "PEDAGIO",
      "MOBILIDADE"
    ]
  },
  {
    name: "Utilidades",
    color: "#14b8a6",
    icon: "Zap",
    patterns: [
      "ENERGIA",
      "LUZ",
      "AGUA",
      "INTERNET",
      "VIVO FIBRA",
      "CLARO",
      "CLARO FLEX",
      "TIM",
      "VIVO",
      "OI",
      "ENEL",
      "CPFL",
      "SABESP",
      "GAS"
    ]
  },
  {
    name: "Saude",
    color: "#ef4444",
    icon: "HeartPulse",
    patterns: [
      "FARMACIA",
      "DROGARIA",
      "HOSPITAL",
      "CLINICA",
      "UNIMED",
      "DROGA RAIA",
      "DROGASIL",
      "PAGUE MENOS",
      "PACHECO",
      "PANVEL",
      "LABORATORIO",
      "ODONTO"
    ]
  },
  {
    name: "Educacao",
    color: "#6366f1",
    icon: "GraduationCap",
    patterns: ["ESCOLA", "FACULDADE", "CURSO", "ALURA", "UDEMY", "ESTACIO", "UNIP", "KUMON", "IDIOMA", "CURSINHO"]
  },
  {
    name: "Assinaturas",
    color: "#8b5cf6",
    icon: "Repeat",
    patterns: [
      "NETFLIX",
      "SPOTIFY",
      "DISNEY",
      "GOOGLE ONE",
      "YOUTUBE PREMIUM",
      "IFOOD CLUB",
      "AMAZON PRIME",
      "PRIME VIDEO",
      "HBO MAX",
      "MAX",
      "GLOBOPLAY",
      "APPLE.COM/BILL",
      "ICLOUD",
      "DEEZER"
    ]
  },
  {
    name: "Transferencias",
    color: "#64748b",
    icon: "ArrowLeftRight",
    patterns: [
      "PIX RECEBIDO",
      "PIX ENVIADO",
      "TED",
      "DOC",
      "TRANSFERENCIA",
      "TRANSFERENCIA PIX",
      "TRANSFER PIX",
      "PAGAMENTO CARTAO DE CREDITO",
      "PAGAMENTO ON LINE",
      "PAGAMENTO DA FATURA",
      "FATURA CARTAO"
    ]
  },
  {
    name: "Investimentos",
    color: "#22c55e",
    icon: "TrendingUp",
    patterns: [
      "INVESTIMENTO",
      "CDB",
      "TESOURO",
      "CORRETORA",
      "B3",
      "RESERVA POR GASTOS",
      "DINHEIRO RESERVADO",
      "DINHEIRO RETIRADO FUTURO",
      "NU INVEST",
      "INTER INVEST",
      "XP INVEST",
      "RENDA FIXA",
      "FII",
      "FUNDO IMOBILIARIO",
      "ACOES",
      "ETF"
    ]
  },
  {
    name: "Lazer",
    color: "#ec4899",
    icon: "PartyPopper",
    patterns: ["CINEMA", "SHOW", "TEATRO", "PARQUE", "PLAYSTATION", "STEAM", "XBOX", "EPIC GAMES", "BOLICHE"]
  },
  {
    name: "Renda",
    color: "#16a34a",
    icon: "Wallet",
    patterns: [
      "SALARIO",
      "PROVENTO",
      "FREELA",
      "RENDIMENTO",
      "RENDIMENTOS",
      "MELI DOLAR",
      "DIVIDENDO",
      "BONIFICACAO",
      "PRO LABORE",
      "REEMBOLSO"
    ]
  },
  {
    name: "Seguros e Protecao",
    color: "#0f766e",
    icon: "Shield",
    patterns: [
      "MAPFRE",
      "SEGURO",
      "SEGURADORA",
      "PORTO SEGURO",
      "TOKIO MARINE",
      "SULAMERICA",
      "BRADESCO SEGUROS",
      "AZUL SEGUROS",
      "ITAU SEGUROS"
    ]
  },
  {
    name: "Taxas e Encargos",
    color: "#475569",
    icon: "Receipt",
    patterns: [
      "IOF",
      "JUROS DE MORA",
      "ENCARGOS ROTATIVO",
      "MULTA POR ATRASO",
      "TARIFA",
      "ANUIDADE",
      "TARIFA BANCARIA",
      "ENCARGO",
      "JUROS",
      "MORA",
      "ROTATIVO"
    ]
  },
  {
    name: "Financiamentos e Consorcios",
    color: "#334155",
    icon: "Landmark",
    patterns: [
      "FINANCIAM",
      "FINANCIAMENTO",
      "CONSORCIO",
      "ANCORA ADMINISTRADORA",
      "SANTANDER SOCIEDADE DE CREDITO",
      "LIMITE CONVERTIDO EM SALDO",
      "EMPRESTIMO",
      "CREDITO PESSOAL",
      "CONSIGNADO",
      "PARCELAMENTO DE COMPRA",
      "AMORTIZACAO"
    ]
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

