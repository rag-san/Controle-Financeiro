import type { CategoryDTO } from "@/lib/types";

export type RecurringFlowTab = "expenses" | "income";

export type RecurringItem = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  status: "active" | "inactive";
  categoryId?: string | null;
  category?: CategoryDTO | null;
  lastPaidAt: Date | null;
};

export type RecurringBootstrapResponse = {
  items: Array<{
    id: string;
    name: string;
    amount: number;
    dueDay: number;
    status: "active" | "inactive";
    categoryId?: string | null;
    category?: CategoryDTO | null;
    lastPaidAt?: string | null;
  }>;
  categories: CategoryDTO[];
};
