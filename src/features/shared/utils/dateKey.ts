import { format } from "date-fns";

export function normalizeDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return format(value, "yyyy-MM-dd");
  }

  return value.slice(0, 10);
}
