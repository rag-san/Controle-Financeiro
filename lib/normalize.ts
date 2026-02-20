import { parse } from "date-fns";
import { parseMoneyInput } from "@/lib/money";

export type NormalizedTransactionDraft = {
  date: Date;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense";
};

export function normalizeDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function parseFlexibleDate(value: string | Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const input = String(value).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    return parse(input, "dd/MM/yyyy", new Date());
  }

  if (/^\d{2}\/\d{2}\/\d{2}$/.test(input)) {
    return parse(input, "dd/MM/yy", new Date());
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(input)) {
    return parse(input, "dd-MM-yyyy", new Date());
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(input)) {
    return parse(input, "dd.MM.yyyy", new Date());
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    const isoDate = new Date(input);
    if (!Number.isNaN(isoDate.getTime())) return isoDate;
  }

  if (/^\d{8}(\d{6})?/.test(input)) {
    const yyyy = Number(input.slice(0, 4));
    const mm = Number(input.slice(4, 6)) - 1;
    const dd = Number(input.slice(6, 8));
    const hh = input.length >= 14 ? Number(input.slice(8, 10)) : 0;
    const min = input.length >= 14 ? Number(input.slice(10, 12)) : 0;
    const ss = input.length >= 14 ? Number(input.slice(12, 14)) : 0;
    return new Date(yyyy, mm, dd, hh, min, ss);
  }

  const fallback = new Date(input);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`Data invalida: ${input}`);
  }

  return fallback;
}

export function inferTypeFromAmount(amount: number): "income" | "expense" {
  return amount >= 0 ? "income" : "expense";
}

export function normalizeTransaction(params: {
  date: string | Date;
  description: string;
  amount: string | number;
  type?: string | null;
}): NormalizedTransactionDraft {
  const date = parseFlexibleDate(params.date);
  let amount = typeof params.amount === "number" ? params.amount : parseMoneyInput(params.amount);
  const loweredType = params.type?.toLowerCase() ?? "";

  if (loweredType.includes("deb") || loweredType.includes("saida") || loweredType.includes("desp")) {
    amount = amount > 0 ? -amount : amount;
  }

  if (loweredType.includes("cred") || loweredType.includes("entrada") || loweredType.includes("rece")) {
    amount = amount < 0 ? Math.abs(amount) : amount;
  }

  const description = params.description.trim();
  const normalizedDescription = normalizeDescription(description);

  return {
    date,
    description,
    normalizedDescription,
    amount,
    type: inferTypeFromAmount(amount)
  };
}
