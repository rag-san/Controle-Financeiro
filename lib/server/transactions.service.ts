import { addDays, endOfMonth, startOfMonth } from "date-fns";
import { z } from "zod";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

export const createTransactionSchema = z.object({
  accountId: z.string().min(6).max(128),
  categoryId: z.string().min(6).max(128).optional().nullable(),
  date: z.string().min(8),
  description: z.string().min(2).max(180),
  amount: z.union([z.number(), z.string()]),
  type: z.enum(["income", "expense"]).optional(),
  status: z.enum(["posted", "pending"]).default("posted")
});

export const transactionsQuerySchema = z.object({
  period: z.enum(["all", "30d", "current-month", "custom"]).optional().default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
  accountId: z.string().min(6).max(128).optional(),
  categoryId: z.string().min(6).max(128).optional(),
  type: z.enum(["income", "expense"]).optional(),
  q: z.string().optional(),
  includeMeta: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50)
});

type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

function buildDateRange(params: TransactionsQuery): { gte?: Date; lte?: Date } {
  if (params.period === "all") {
    return {};
  }

  if (params.period === "custom") {
    return {
      gte: params.from ? new Date(params.from) : undefined,
      lte: params.to ? new Date(params.to) : undefined
    };
  }

  if (params.period === "current-month") {
    const now = new Date();
    return {
      gte: startOfMonth(now),
      lte: endOfMonth(now)
    };
  }

  return {
    gte: addDays(new Date(), -30),
    lte: new Date()
  };
}

export function listTransactionsForUser(userId: string, params: TransactionsQuery) {
  const dateRange = buildDateRange(params);
  const page = params.page;
  const pageSize = params.pageSize;
  const includeMeta = params.includeMeta;

  const filter = {
    userId,
    dateFrom: dateRange.gte,
    dateTo: dateRange.lte,
    accountId: params.accountId || undefined,
    categoryId: params.categoryId || undefined,
    type: params.type || undefined,
    normalizedQuery: params.q ? normalizeDescription(params.q) : undefined
  };

  const items = transactionsRepo.listPaged(filter, { page, pageSize });
  const totalCount = transactionsRepo.count(filter);
  const totalsByType = transactionsRepo.sumByType(filter);

  const income = totalsByType.find((item) => item.type === "income")?.amount ?? 0;
  const expenseRaw = totalsByType.find((item) => item.type === "expense")?.amount ?? 0;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    summary: {
      income,
      expense: Math.abs(expenseRaw),
      balance: income + expenseRaw
    },
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    },
    ...(includeMeta
      ? {
          meta: {
            accounts: accountsRepo.listByUser(userId),
            categories: categoriesRepo.listByUser(userId)
          }
        }
      : {})
  };
}

export function createTransactionForUser(userId: string, input: CreateTransactionInput) {
  const draft = normalizeTransaction({
    date: input.date,
    description: input.description,
    amount: input.amount,
    type: input.type
  });

  return transactionsRepo.create({
    userId,
    accountId: input.accountId,
    categoryId: input.categoryId,
    date: draft.date,
    description: draft.description,
    normalizedDescription: draft.normalizedDescription,
    amount: draft.amount,
    type: draft.type,
    status: input.status
  });
}
