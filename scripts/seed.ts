import { db, initDbOnce } from "../lib/db";
import { normalizeDescription } from "../lib/normalize";
import { accountsRepo } from "../lib/server/accounts.repo";
import { categoriesRepo } from "../lib/server/categories.repo";
import { transactionsRepo } from "../lib/server/transactions.repo";
import { usersRepo } from "../lib/server/users.repo";

type SeedSummary = {
  income: number;
  expense: number;
  net: number;
};

type SeedCategoryKey =
  | "supermercado"
  | "delivery"
  | "combustivel"
  | "assinaturas"
  | "transporte"
  | "transferencias";

export type SeedResult = {
  userId: string;
  email: string;
  accounts: {
    checkingId: string;
    creditId: string;
  };
  categories: Record<SeedCategoryKey, string>;
  createdCount: number;
  totals: SeedSummary;
};

type SeedTransactionDraft = {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  accountId: "checking" | "credit";
  categoryKey?: SeedCategoryKey | null;
};

const SEED_USER_EMAIL = "seed.reports@example.com";
const SEED_USER_NAME = "Seed Reports QA";

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function cleanupExistingSeedUser(email: string): void {
  const existing = usersRepo.findByEmail(email);
  if (!existing) return;
  db.prepare("DELETE FROM users WHERE id = ?").run(existing.id);
}

export function seedTestData(): SeedResult {
  initDbOnce();
  cleanupExistingSeedUser(SEED_USER_EMAIL);

  const user = usersRepo.create({
    email: SEED_USER_EMAIL,
    name: SEED_USER_NAME,
    password: null
  });

  if (!user) {
    throw new Error("Falha ao criar usuário seed.");
  }

  const checking = accountsRepo.create({
    userId: user.id,
    name: "Conta Corrente QA",
    type: "checking",
    institution: "Nubank"
  });
  const credit = accountsRepo.create({
    userId: user.id,
    name: "Cartão QA",
    type: "credit",
    institution: "Nubank"
  });

  if (!checking || !credit) {
    throw new Error("Falha ao criar contas seed.");
  }

  const parentFood = categoriesRepo.create({
    userId: user.id,
    name: "Alimentacao",
    color: "#f97316",
    icon: "food"
  });
  const parentTransport = categoriesRepo.create({
    userId: user.id,
    name: "Transporte",
    color: "#0ea5e9",
    icon: "car"
  });
  const parentServices = categoriesRepo.create({
    userId: user.id,
    name: "Servicos",
    color: "#8b5cf6",
    icon: "services"
  });

  if (!parentFood || !parentTransport || !parentServices) {
    throw new Error("Falha ao criar categorias pai seed.");
  }

  const supermercado = categoriesRepo.create({
    userId: user.id,
    name: "Supermercado",
    color: "#16a34a",
    icon: "cart",
    parentId: parentFood.id
  });
  const delivery = categoriesRepo.create({
    userId: user.id,
    name: "Delivery",
    color: "#a855f7",
    icon: "delivery",
    parentId: parentFood.id
  });
  const combustivel = categoriesRepo.create({
    userId: user.id,
    name: "Combustivel",
    color: "#f59e0b",
    icon: "fuel",
    parentId: parentTransport.id
  });
  const assinaturas = categoriesRepo.create({
    userId: user.id,
    name: "Assinaturas",
    color: "#6366f1",
    icon: "subscriptions",
    parentId: parentServices.id
  });
  const transferencias = categoriesRepo.create({
    userId: user.id,
    name: "Transferencias",
    color: "#64748b",
    icon: "transfers"
  });
  const transporteUrbano = categoriesRepo.create({
    userId: user.id,
    name: "Transporte urbano",
    color: "#0ea5e9",
    icon: "taxi",
    parentId: parentTransport.id
  });

  if (!supermercado || !delivery || !combustivel || !assinaturas || !transferencias || !transporteUrbano) {
    throw new Error("Falha ao criar categorias filhas seed.");
  }

  const categories: Record<SeedCategoryKey, string> = {
    supermercado: supermercado.id,
    delivery: delivery.id,
    combustivel: combustivel.id,
    assinaturas: assinaturas.id,
    transporte: transporteUrbano.id,
    transferencias: transferencias.id
  };

  const drafts: SeedTransactionDraft[] = [
    { date: "2025-12-05", description: "Salário Empresa XPTO", amount: 5000, type: "income", accountId: "checking" },
    { date: "2026-01-05", description: "Salário Empresa XPTO", amount: 5200, type: "income", accountId: "checking" },
    { date: "2026-02-05", description: "Salário Empresa XPTO", amount: 5200, type: "income", accountId: "checking" },
    { date: "2026-02-12", description: "Estorno iFood", amount: 120, type: "income", accountId: "checking" },
    { date: "2025-12-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-01-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-02-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2025-12-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-01-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-02-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2025-12-15", description: "Supermercado Extra", amount: -350, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-01-15", description: "Supermercado Extra", amount: -387.45, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-02-16", description: "Supermercado Extra", amount: -410.1, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-01-02", description: "iFood - Jantar", amount: -58.9, type: "expense", accountId: "credit", categoryKey: "delivery" },
    { date: "2026-02-02", description: "iFood - Jantar", amount: -62.5, type: "expense", accountId: "credit", categoryKey: "delivery" },
    { date: "2026-01-04", description: "Shell - Combustivel", amount: -150, type: "expense", accountId: "checking", categoryKey: "combustivel" },
    { date: "2026-02-04", description: "Shell - Combustivel", amount: -172, type: "expense", accountId: "checking", categoryKey: "combustivel" },
    { date: "2026-02-03", description: "Uber *TRIP", amount: -24.9, type: "expense", accountId: "credit", categoryKey: "transporte" },
    { date: "2026-02-03", description: "Uber *TRIP", amount: -24.9, type: "expense", accountId: "credit", categoryKey: "transporte" },
    { date: "2026-02-06", description: "Farmácia Central", amount: -89, type: "expense", accountId: "checking", categoryKey: null },
    { date: "2026-01-20", description: "Transferência enviada", amount: -1000, type: "expense", accountId: "checking", categoryKey: "transferencias" },
    { date: "2026-02-19", description: "Transferência recebida", amount: 900, type: "income", accountId: "checking" }
  ];

  let createdCount = 0;
  let income = 0;
  let expense = 0;

  for (const draft of drafts) {
    const accountId = draft.accountId === "checking" ? checking.id : credit.id;
    const categoryId =
      draft.categoryKey && categories[draft.categoryKey]
        ? categories[draft.categoryKey]
        : null;

    const created = transactionsRepo.create({
      userId: user.id,
      accountId,
      categoryId,
      date: new Date(`${draft.date}T12:00:00.000Z`),
      description: draft.description,
      normalizedDescription: normalizeDescription(draft.description),
      amount: draft.amount,
      type: draft.type,
      status: "posted"
    });

    if (!created) {
      throw new Error(`Falha ao criar transação seed: ${draft.description}`);
    }

    createdCount += 1;
    if (draft.type === "income") {
      income = round2(income + Math.abs(draft.amount));
    } else {
      expense = round2(expense + Math.abs(draft.amount));
    }
  }

  return {
    userId: user.id,
    email: SEED_USER_EMAIL,
    accounts: {
      checkingId: checking.id,
      creditId: credit.id
    },
    categories,
    createdCount,
    totals: {
      income,
      expense,
      net: round2(income - expense)
    }
  };
}

function runSeedCli(): void {
  const seeded = seedTestData();
  console.log(`[seed] user=${seeded.email} (${seeded.userId})`);
  console.log(
    `[seed] transactions=${seeded.createdCount} income=${seeded.totals.income.toFixed(2)} expense=${seeded.totals.expense.toFixed(2)} net=${seeded.totals.net.toFixed(2)}`
  );
  console.log("PASS");
}

if (process.argv[1]?.includes("seed.ts")) {
  runSeedCli();
}
