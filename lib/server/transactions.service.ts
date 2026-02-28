import { addDays, endOfMonth, startOfMonth, subMonths } from "date-fns";
import { z } from "zod";
import { totalsFromGroupedTypes } from "@/lib/finance/official-metrics";
import { isValidFlexibleDate, normalizeDescription, normalizeTransaction, parseFlexibleDate } from "@/lib/normalize";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { transactionsRepo } from "@/lib/server/transactions.repo";

const flexibleDateSchema = z
  .string()
  .min(8)
  .refine((value) => isValidFlexibleDate(value), {
    message: "Data invalida"
  });

export const createTransactionSchema = z.object({
  accountId: z.string().min(6).max(128),
  categoryId: z.string().min(6).max(128).optional().nullable(),
  date: flexibleDateSchema,
  description: z.string().min(2).max(180),
  amount: z.union([z.number(), z.string()]),
  type: z.enum(["income", "expense"]).optional(),
  excluded: z.boolean().optional(),
  status: z.enum(["posted", "pending"]).default("posted")
});

export const transactionsQuerySchema = z.object({
  period: z
    .enum(["all", "7d", "30d", "90d", "this-month", "last-month", "current-month", "custom"])
    .optional()
    .default("current-month"),
  from: z.string().optional(),
  to: z.string().optional(),
  accountId: z.string().min(6).max(128).optional(),
  categoryId: z.string().min(6).max(128).optional(),
  type: z.enum(["income", "expense", "transfer"]).optional(),
  excluded: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).optional().default("date_desc"),
  hideCardPaymentMirrorInflow: z.coerce.boolean().optional(),
  includeMeta: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50)
}).superRefine((value, context) => {
  if (value.from && !isValidFlexibleDate(value.from)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: "Data inicial invalida"
    });
  }

  if (value.to && !isValidFlexibleDate(value.to)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "Data final invalida"
    });
  }

  if (value.from && value.to && isValidFlexibleDate(value.from) && isValidFlexibleDate(value.to)) {
    const from = parseFlexibleDate(value.from);
    const to = parseFlexibleDate(value.to);

    if (from.getTime() > to.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Data final deve ser maior ou igual a data inicial"
      });
    }
  }
});

type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

function buildDateRange(params: TransactionsQuery): { gte?: Date; lte?: Date } {
  if (params.from || params.to || params.period === "custom") {
    return {
      gte: params.from ? parseFlexibleDate(params.from) : undefined,
      lte: params.to ? parseFlexibleDate(params.to) : undefined
    };
  }

  if (params.period === "all") {
    return {};
  }

  if (params.period === "current-month" || params.period === "this-month") {
    const now = new Date();
    return {
      gte: startOfMonth(now),
      lte: endOfMonth(now)
    };
  }

  if (params.period === "last-month") {
    const now = new Date();
    const reference = subMonths(now, 1);
    return {
      gte: startOfMonth(reference),
      lte: endOfMonth(reference)
    };
  }

  const daysByPeriod = params.period === "7d" ? 6 : params.period === "90d" ? 89 : 29;

  return {
    gte: addDays(new Date(), -daysByPeriod),
    lte: new Date()
  };
}

export async function listTransactionsForUser(userId: string, params: TransactionsQuery) {
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
    excluded: params.excluded === "true" ? true : false,
    normalizedQuery: params.q ? normalizeDescription(params.q) : undefined,
    hideCardPaymentMirrorInflow: params.hideCardPaymentMirrorInflow ?? true
  };

  const items = await transactionsRepo.listPaged(filter, { page, pageSize }, { sort: params.sort });
  const totalCount = await transactionsRepo.count(filter);
  const totalsByType = await transactionsRepo.sumByType(filter);
  const totals = totalsFromGroupedTypes(totalsByType);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    summary: {
      income: totals.income,
      expense: totals.expense,
      balance: totals.net
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
            accounts: await accountsRepo.listByUser(userId),
            categories: await categoriesRepo.listByUser(userId)
          }
        }
      : {})
  };
}

export async function createTransactionForUser(userId: string, input: CreateTransactionInput) {
  const account = await accountsRepo.findByIdForUser(input.accountId, userId);
  if (!account) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }
  if (account.type === "credit") {
    throw new Error("CREDIT_ACCOUNT_MANUAL_NOT_ALLOWED");
  }

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
    excluded: input.excluded,
    status: input.status
  });
}
