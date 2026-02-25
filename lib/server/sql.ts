import { db } from "@/lib/db";

export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number((value / 100).toFixed(2));
}

export function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

export function intToBool(value: number): boolean {
  return value === 1;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function dbTransaction<T>(run: () => Promise<T>): Promise<T> {
  const trx = db.transaction(run);
  return await trx();
}

export function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}



