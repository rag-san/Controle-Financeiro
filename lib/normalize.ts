import { parse } from "date-fns";
import { parseMoneyInput } from "@/lib/money";

export type NormalizedTransactionDraft = {
  date: Date;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense" | "transfer";
};

export function normalizeDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseByPattern(input: string, pattern: string): Date {
  const parsed = parse(input, pattern, new Date());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data invalida: ${input}`);
  }
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0));
}

function parseIsoDateOnly(input: string): Date | null {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Data invalida: ${input}`);
  }

  return parsed;
}

export function parseFlexibleDate(value: string | Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const input = String(value).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    return parseByPattern(input, "dd/MM/yyyy");
  }

  if (/^\d{2}\/\d{2}\/\d{2}$/.test(input)) {
    return parseByPattern(input, "dd/MM/yy");
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(input)) {
    return parseByPattern(input, "dd-MM-yyyy");
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(input)) {
    return parseByPattern(input, "dd.MM.yyyy");
  }

  const isoDateOnly = parseIsoDateOnly(input);
  if (isoDateOnly) {
    return isoDateOnly;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    const isoDate = new Date(input);
    if (!Number.isNaN(isoDate.getTime())) return isoDate;
  }

  if (/^\d{8}(\d{6})?/.test(input)) {
    const yyyy = Number(input.slice(0, 4));
    const mm = Number(input.slice(4, 6)) - 1;
    const dd = Number(input.slice(6, 8));
    const hh = input.length >= 14 ? Number(input.slice(8, 10)) : 12;
    const min = input.length >= 14 ? Number(input.slice(10, 12)) : 0;
    const ss = input.length >= 14 ? Number(input.slice(12, 14)) : 0;
    const parsed = new Date(Date.UTC(yyyy, mm, dd, hh, min, ss));
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Data invalida: ${input}`);
    }
    return parsed;
  }

  const fallback = new Date(input);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`Data invalida: ${input}`);
  }

  return fallback;
}

export function isValidFlexibleDate(value: string | Date): boolean {
  try {
    const parsed = parseFlexibleDate(value);
    return Number.isFinite(parsed.getTime());
  } catch {
    return false;
  }
}

function inferTypeFromAmount(amount: number): "income" | "expense" {
  return amount >= 0 ? "income" : "expense";
}

function normalizeTypeHint(value: string | null | undefined): string {
  return normalizeDescription(String(value ?? ""));
}

function isExplicitTransferTypeHint(typeHint: string): boolean {
  return [
    "TRANSFER",
    "TRANSFERENCIA",
    "TRANSF",
    "TED",
    "DOC"
  ].includes(typeHint);
}

export function normalizeTransaction(params: {
  date: string | Date;
  description: string;
  amount: string | number;
  type?: string | null;
}): NormalizedTransactionDraft {
  const date = parseFlexibleDate(params.date);
  let amount = typeof params.amount === "number" ? params.amount : parseMoneyInput(params.amount);
  const normalizedType = normalizeTypeHint(params.type);
  const loweredType = normalizedType.toLowerCase();
  const isTransferType = isExplicitTransferTypeHint(normalizedType);

  if (!isTransferType && (loweredType.includes("deb") || loweredType.includes("saida") || loweredType.includes("desp"))) {
    amount = amount > 0 ? -amount : amount;
  }

  if (!isTransferType && (loweredType.includes("cred") || loweredType.includes("entrada") || loweredType.includes("rece"))) {
    amount = amount < 0 ? Math.abs(amount) : amount;
  }

  const description = params.description.trim();
  const normalizedDescription = normalizeDescription(description);

  return {
    date,
    description,
    normalizedDescription,
    amount,
    type: isTransferType ? "transfer" : inferTypeFromAmount(amount)
  };
}
