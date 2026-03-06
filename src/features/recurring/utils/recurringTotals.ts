import { endOfMonth, isSameMonth, startOfMonth } from "date-fns";
import type { RecurringFlowTab, RecurringItem } from "@/src/features/recurring/types";

export type RecurringTotals = {
  scheduled: number;
  paid: number;
  remaining: number;
  progress: number;
};

export type RecurringMonthGroup = {
  date: Date;
  dueDay: number;
  items: RecurringItem[];
  total: number;
};

function resolveMonthDate(referenceDate: Date, dueDay: number): Date {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const safeDueDay = Math.max(1, Math.min(dueDay, monthEnd.getDate()));
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), safeDueDay);
}

function resolveRecurringFlow(amount: number): RecurringFlowTab {
  return amount >= 0 ? "expenses" : "income";
}

export function parseRecurringItems(items: Array<Omit<RecurringItem, "lastPaidAt"> & { lastPaidAt?: string | Date | null }>): RecurringItem[] {
  return items.map((item) => {
    const parsedLastPaidAt =
      item.lastPaidAt instanceof Date
        ? item.lastPaidAt
        : item.lastPaidAt
          ? new Date(item.lastPaidAt)
          : null;

    return {
      ...item,
      lastPaidAt: parsedLastPaidAt && !Number.isNaN(parsedLastPaidAt.getTime()) ? parsedLastPaidAt : null
    };
  });
}

function filterByFlow(items: RecurringItem[], flow: RecurringFlowTab): RecurringItem[] {
  return items.filter((item) => resolveRecurringFlow(item.amount) === flow);
}

export function calculateRecurringTotals(
  items: RecurringItem[],
  flow: RecurringFlowTab,
  referenceDate: Date = new Date()
): RecurringTotals {
  const filtered = filterByFlow(items, flow).filter((item) => item.status === "active");

  const scheduled = filtered.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const paid = filtered.reduce((sum, item) => {
    if (!item.lastPaidAt || !isSameMonth(item.lastPaidAt, referenceDate)) {
      return sum;
    }
    return sum + Math.abs(item.amount);
  }, 0);

  const remaining = Math.max(0, scheduled - paid);
  const progress = scheduled > 0 ? Math.min(1, paid / scheduled) : 0;

  return {
    scheduled: Number(scheduled.toFixed(2)),
    paid: Number(paid.toFixed(2)),
    remaining: Number(remaining.toFixed(2)),
    progress: Number(progress.toFixed(4))
  };
}

export function groupRecurringItemsByDueDate(
  items: RecurringItem[],
  flow: RecurringFlowTab,
  referenceDate: Date = new Date()
): RecurringMonthGroup[] {
  const filtered = filterByFlow(items, flow).filter((item) => item.status === "active");
  const groupsByDay = new Map<number, RecurringItem[]>();

  for (const item of filtered) {
    const bucket = groupsByDay.get(item.dueDay) ?? [];
    bucket.push(item);
    groupsByDay.set(item.dueDay, bucket);
  }

  return [...groupsByDay.entries()]
    .sort(([left], [right]) => left - right)
    .map(([dueDay, groupItems]) => ({
      dueDay,
      date: resolveMonthDate(referenceDate, dueDay),
      items: [...groupItems].sort((left, right) => Math.abs(left.amount) - Math.abs(right.amount)),
      total: Number(groupItems.reduce((sum, item) => sum + Math.abs(item.amount), 0).toFixed(2))
    }));
}
