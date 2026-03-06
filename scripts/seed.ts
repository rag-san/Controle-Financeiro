import { db, initDbOnce } from "../lib/db";
import { normalizeDescription } from "../lib/normalize";
import { accountsRepo } from "../lib/server/accounts.repo";
import { categoriesRepo } from "../lib/server/categories.repo";
import { ledgerRepo } from "../lib/server/ledger.repo";
import { importLedgerForUser, runTransferMatcherForUser } from "../lib/server/ledger.service";
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

export type LedgerSeedResult = {
  userId: string;
  email: string;
  checkingAccountIds: {
    inter: string;
    nubank: string;
  };
  creditCardAccountId: string;
  assertions: {
    spending: number;
    cashTotal: number;
    cardDebt: number;
  };
};

type SeedTransactionDraft = {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  accountId: "checking" | "credit";
  categoryKey?: SeedCategoryKey | null;
  excluded?: boolean;
};

const SEED_USER_EMAIL = "seed.reports@example.com";
const SEED_USER_NAME = "Seed Reports QA";
const LEDGER_SEED_USER_EMAIL = "seed.ledger@example.com";
const LEDGER_SEED_USER_NAME = "Seed Ledger QA";

function round2(value: number): number {
  return Number(value.toFixed(2));
}

async function cleanupExistingSeedUser(email: string): Promise<void> {
  const existing = await usersRepo.findByEmail(email);
  if (!existing) return;
  await db.prepare("DELETE FROM users WHERE id = ?").run(existing.id);
}

export async function seedTestData(): Promise<SeedResult> {
  await initDbOnce();
  await cleanupExistingSeedUser(SEED_USER_EMAIL);

  const user = await usersRepo.create({
    email: SEED_USER_EMAIL,
    name: SEED_USER_NAME,
    password: null
  });

  if (!user) {
    throw new Error("Falha ao criar usuario seed.");
  }

  const checking = await accountsRepo.create({
    userId: user.id,
    name: "Conta Corrente QA",
    type: "checking",
    institution: "Nubank"
  });
  const credit = await accountsRepo.create({
    userId: user.id,
    name: "Cartao QA",
    type: "credit",
    institution: "Nubank"
  });

  if (!checking || !credit) {
    throw new Error("Falha ao criar contas seed.");
  }

  const parentFood = await categoriesRepo.create({
    userId: user.id,
    name: "Alimentacao",
    color: "#f97316",
    icon: "food"
  });
  const parentTransport = await categoriesRepo.create({
    userId: user.id,
    name: "Transporte",
    color: "#0ea5e9",
    icon: "car"
  });
  const parentServices = await categoriesRepo.create({
    userId: user.id,
    name: "Servicos",
    color: "#8b5cf6",
    icon: "services"
  });

  if (!parentFood || !parentTransport || !parentServices) {
    throw new Error("Falha ao criar categorias pai seed.");
  }

  const supermercado = await categoriesRepo.create({
    userId: user.id,
    name: "Supermercado",
    color: "#16a34a",
    icon: "cart",
    parentId: parentFood.id
  });
  const delivery = await categoriesRepo.create({
    userId: user.id,
    name: "Delivery",
    color: "#a855f7",
    icon: "delivery",
    parentId: parentFood.id
  });
  const combustivel = await categoriesRepo.create({
    userId: user.id,
    name: "Combustivel",
    color: "#f59e0b",
    icon: "fuel",
    parentId: parentTransport.id
  });
  const assinaturas = await categoriesRepo.create({
    userId: user.id,
    name: "Assinaturas",
    color: "#6366f1",
    icon: "subscriptions",
    parentId: parentServices.id
  });
  const transferencias = await categoriesRepo.create({
    userId: user.id,
    name: "Transferencias",
    color: "#64748b",
    icon: "transfers"
  });
  const transporteUrbano = await categoriesRepo.create({
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
    { date: "2025-09-05", description: "Salario Empresa XPTO", amount: 4800, type: "income", accountId: "checking" },
    { date: "2025-10-05", description: "Salario Empresa XPTO", amount: 4900, type: "income", accountId: "checking" },
    { date: "2025-11-05", description: "Salario Empresa XPTO", amount: 4950, type: "income", accountId: "checking" },
    { date: "2025-12-05", description: "Salario Empresa XPTO", amount: 5000, type: "income", accountId: "checking" },
    { date: "2026-01-05", description: "Salario Empresa XPTO", amount: 5200, type: "income", accountId: "checking" },
    { date: "2026-02-05", description: "Salario Empresa XPTO", amount: 5200, type: "income", accountId: "checking" },
    { date: "2026-03-05", description: "Salario Empresa XPTO", amount: 5300, type: "income", accountId: "checking" },
    { date: "2026-04-05", description: "Salario Empresa XPTO", amount: 5300, type: "income", accountId: "checking" },
    { date: "2026-02-12", description: "Estorno iFood", amount: 120, type: "income", accountId: "checking" },
    { date: "2026-03-12", description: "Freela Desenvolvimento", amount: 900, type: "income", accountId: "checking" },
    { date: "2025-12-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-01-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-02-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-03-10", description: "NETFLIX.COM", amount: -39.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2025-12-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-01-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-02-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2026-03-11", description: "Spotify AB", amount: -21.9, type: "expense", accountId: "credit", categoryKey: "assinaturas" },
    { date: "2025-12-15", description: "Supermercado Extra", amount: -350, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-01-15", description: "Supermercado Extra", amount: -387.45, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-02-16", description: "Supermercado Extra", amount: -410.1, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-03-16", description: "Supermercado Extra", amount: -432.2, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-04-16", description: "Supermercado Extra", amount: -445.35, type: "expense", accountId: "checking", categoryKey: "supermercado" },
    { date: "2026-01-02", description: "iFood - Jantar", amount: -58.9, type: "expense", accountId: "credit", categoryKey: "delivery" },
    { date: "2026-02-02", description: "iFood - Jantar", amount: -62.5, type: "expense", accountId: "credit", categoryKey: "delivery" },
    { date: "2026-03-02", description: "iFood - Jantar", amount: -66.2, type: "expense", accountId: "credit", categoryKey: "delivery" },
    { date: "2026-01-04", description: "Shell - Combustivel", amount: -150, type: "expense", accountId: "checking", categoryKey: "combustivel" },
    { date: "2026-02-04", description: "Shell - Combustivel", amount: -172, type: "expense", accountId: "checking", categoryKey: "combustivel" },
    { date: "2026-03-04", description: "Shell - Combustivel", amount: -168, type: "expense", accountId: "checking", categoryKey: "combustivel" },
    { date: "2026-02-03", description: "Uber *TRIP", amount: -24.9, type: "expense", accountId: "credit", categoryKey: "transporte" },
    { date: "2026-02-03", description: "Uber *TRIP", amount: -24.9, type: "expense", accountId: "credit", categoryKey: "transporte" },
    { date: "2026-03-18", description: "Uber *TRIP", amount: -29.5, type: "expense", accountId: "credit", categoryKey: "transporte" },
    { date: "2026-02-06", description: "Farmacia Central", amount: -89, type: "expense", accountId: "checking", categoryKey: null },
    { date: "2026-03-22", description: "Assinatura antiga cancelada", amount: -65, type: "expense", accountId: "credit", categoryKey: "assinaturas", excluded: true }
  ];

  let createdCount = 0;
  let income = 0;
  let expense = 0;

  for (const draft of drafts) {
    const accountId = draft.accountId === "checking" ? checking.id : credit.id;
    const categoryId = draft.categoryKey && categories[draft.categoryKey] ? categories[draft.categoryKey] : null;

    const created = await transactionsRepo.create({
      userId: user.id,
      accountId,
      categoryId,
      date: new Date(`${draft.date}T12:00:00.000Z`),
      description: draft.description,
      normalizedDescription: normalizeDescription(draft.description),
      amount: draft.amount,
      type: draft.type,
      excluded: draft.excluded ?? false,
      status: "posted"
    });

    if (!created) {
      throw new Error(`Falha ao criar transacao seed: ${draft.description}`);
    }

    createdCount += 1;
    if (draft.excluded) {
      continue;
    }

    if (draft.type === "income") {
      income = round2(income + Math.abs(draft.amount));
    } else {
      expense = round2(expense + Math.abs(draft.amount));
    }
  }

  const transferPairs = [
    { date: "2026-01-20", amount: 1000 },
    { date: "2026-02-19", amount: 900 },
    { date: "2026-03-21", amount: 1200 }
  ];

  for (const transfer of transferPairs) {
    const transferResult = await transactionsRepo.createTransferPair({
      userId: user.id,
      fromAccountId: checking.id,
      toAccountId: credit.id,
      date: new Date(`${transfer.date}T12:00:00.000Z`),
      description: "Transferencia interna seed",
      normalizedDescription: normalizeDescription("Transferencia interna seed"),
      amount: transfer.amount,
      status: "posted"
    });

    if (transferResult.created) {
      createdCount += 2;
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

export async function seedLedgerFixtures(): Promise<LedgerSeedResult> {
  await initDbOnce();
  await cleanupExistingSeedUser(LEDGER_SEED_USER_EMAIL);

  const user = await usersRepo.create({
    email: LEDGER_SEED_USER_EMAIL,
    name: LEDGER_SEED_USER_NAME,
    password: null
  });

  if (!user) {
    throw new Error("Falha ao criar usuario seed do ledger.");
  }

  const interInstitution = await ledgerRepo.findOrCreateInstitution({
    name: "Inter"
  });
  const nubankInstitution = await ledgerRepo.findOrCreateInstitution({
    name: "Nubank"
  });

  const interAccount = await accountsRepo.create({
    userId: user.id,
    name: "Inter Conta Corrente",
    type: "checking",
    institution: "Inter"
  });
  const nubankAccount = await accountsRepo.create({
    userId: user.id,
    name: "Nubank Conta Corrente",
    type: "checking",
    institution: "Nubank"
  });

  if (!interAccount || !nubankAccount) {
    throw new Error("Falha ao criar contas de seed do ledger.");
  }

  const card = await ledgerRepo.createCreditCardAccount({
    userId: user.id,
    institutionId: interInstitution.id,
    name: "Cartão Inter",
    currency: "BRL",
    closingDay: 7,
    dueDay: 15,
    defaultPaymentAccountId: interAccount.id
  });

  if (!card) {
    throw new Error("Falha ao criar cartão de seed do ledger.");
  }

  await importLedgerForUser(user.id, {
    institutionId: interInstitution.id,
    kind: "CC_STATEMENT",
    filename: "seed-card-statement.csv",
    defaultCreditCardAccountId: card.id,
    rows: [
      {
        postedAt: "2026-02-03T00:00:00.000Z",
        amount: -120,
        description: "COMPRA CARTAO MERCADO QA",
        direction: "OUT"
      }
    ]
  });

  await importLedgerForUser(user.id, {
    institutionId: interInstitution.id,
    kind: "BANK_STATEMENT",
    filename: "seed-bank-inter.csv",
    defaultAccountId: interAccount.id,
    rows: [
      {
        postedAt: "2026-02-12T00:00:00.000Z",
        amount: -120,
        description: "PAGAMENTO FATURA CARTAO INTER",
        direction: "OUT"
      },
      {
        postedAt: "2026-02-14T00:00:00.000Z",
        amount: -500,
        description: "PIX ENVIADO PARA NUBANK",
        direction: "OUT"
      }
    ]
  });

  await importLedgerForUser(user.id, {
    institutionId: nubankInstitution.id,
    kind: "BANK_STATEMENT",
    filename: "seed-bank-nubank.csv",
    defaultAccountId: nubankAccount.id,
    rows: [
      {
        postedAt: "2026-02-14T00:00:00.000Z",
        amount: 500,
        description: "PIX RECEBIDO DE INTER",
        direction: "IN"
      }
    ]
  });

  await runTransferMatcherForUser({ userId: user.id });

  const summary = await ledgerRepo.getDashboardSummary({
    userId: user.id
  });

  const cashTotal = round2(summary.cashBalance.reduce((acc, item) => acc + item.amount, 0));
  const cardDebt = round2(summary.cardDebt.reduce((acc, item) => acc + item.amount, 0));

  return {
    userId: user.id,
    email: LEDGER_SEED_USER_EMAIL,
    checkingAccountIds: {
      inter: interAccount.id,
      nubank: nubankAccount.id
    },
    creditCardAccountId: card.id,
    assertions: {
      spending: summary.totalSpending,
      cashTotal,
      cardDebt
    }
  };
}

async function runSeedCli(): Promise<void> {
  const seeded = await seedTestData();
  const ledgerSeed = await seedLedgerFixtures();
  console.log(`[seed] user=${seeded.email} (${seeded.userId})`);
  console.log(
    `[seed] transactions=${seeded.createdCount} income=${seeded.totals.income.toFixed(2)} expense=${seeded.totals.expense.toFixed(2)} net=${seeded.totals.net.toFixed(2)}`
  );
  console.log(`[seed][ledger] user=${ledgerSeed.email} (${ledgerSeed.userId})`);
  console.log(
    `[seed][ledger] spending=${ledgerSeed.assertions.spending.toFixed(2)} cashTotal=${ledgerSeed.assertions.cashTotal.toFixed(2)} cardDebt=${ledgerSeed.assertions.cardDebt.toFixed(2)}`
  );
  console.log("PASS");
}

if (process.argv[1]?.includes("seed.ts")) {
  runSeedCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
