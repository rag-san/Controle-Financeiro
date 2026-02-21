import { parseFlexibleDate } from "@/lib/normalize";
import { parseMoneyInput } from "@/lib/money";

export type ParsedPdfRow = {
  date: Date;
  description: string;
  amount: number;
  type: "income" | "expense";
  raw: {
    line: string;
    dateText: string;
    amountText: string;
  };
};

type ParsedLine = {
  date: Date;
  description: string;
  amount: number;
  type: "income" | "expense";
  dateText: string;
  amountText: string;
};

const dateRegex = /\b(\d{2}\/\d{2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const amountTokenPattern = String.raw`[+-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})(?:\s*[CD])?`;
const ignoreDescriptionRegex = /\b(SALDO\s+ANTERIOR|SALDO\s+FINAL|SALDO\s+DISPON[IÍ]VEL|SALDO\s+DO\s+DIA)\b/i;

function normalizeLine(line: string): string {
  return line
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeShortDate(value: string): string {
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
    return value;
  }

  const [dd, mm, yy] = value.split("/");
  const year = Number(yy);
  const fullYear = year >= 70 ? `19${yy}` : `20${yy}`;
  return `${dd}/${mm}/${fullYear}`;
}

function resolveSignedAmount(amountText: string, line: string): number {
  const normalizedText = amountText.toUpperCase();
  const raw = parseMoneyInput(normalizedText.replace(/[CD]$/i, "").trim());

  const hasNegativeMarker = normalizedText.includes("-") || /\bD\b$/i.test(normalizedText);
  const hasPositiveMarker = normalizedText.includes("+") || /\bC\b$/i.test(normalizedText);

  if (hasNegativeMarker) return raw > 0 ? -raw : raw;
  if (hasPositiveMarker) return raw < 0 ? Math.abs(raw) : raw;

  const lowered = line.toLowerCase();
  if (/\b(debito|d[ée]bito|sa[ií]da|compra|pagamento|tarifa|pix enviado)\b/.test(lowered)) {
    return raw > 0 ? -raw : raw;
  }
  if (/\b(credito|cr[ée]dito|entrada|dep[oó]sito|pix recebido)\b/.test(lowered)) {
    return raw < 0 ? Math.abs(raw) : raw;
  }

  return raw;
}

function pickAmountToken(line: string): string | null {
  const matches = [...line.matchAll(new RegExp(amountTokenPattern, "gi"))]
    .map((match) => match[0]?.trim())
    .filter(Boolean) as string[];
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const explicit = matches.find((token) => /[+-]/.test(token) || /\b[CD]\b$/i.test(token));
  if (explicit) return explicit;

  return matches[0];
}

function parseLineToTransaction(line: string): ParsedLine | null {
  const dateMatch = line.match(dateRegex);
  if (!dateMatch?.[1]) return null;

  const amountText = pickAmountToken(line);
  if (!amountText) return null;

  const normalizedDateText = normalizeShortDate(dateMatch[1]);
  const date = parseFlexibleDate(normalizedDateText);
  const amount = resolveSignedAmount(amountText, line);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) return null;

  const description = normalizeLine(
    line
      .replace(dateMatch[1], " ")
      .replace(new RegExp(amountTokenPattern, "gi"), " ")
      .replace(/\b[CD]\b$/i, " ")
  );

  if (!description || ignoreDescriptionRegex.test(description)) {
    return null;
  }

  return {
    date,
    description,
    amount,
    type: amount >= 0 ? "income" : "expense",
    dateText: normalizedDateText,
    amountText
  };
}

function collectCandidateLines(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 0);

  const candidates: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!dateRegex.test(line)) {
      continue;
    }

    if (new RegExp(amountTokenPattern, "i").test(line)) {
      candidates.push(line);
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine) {
      const combined = `${line} ${nextLine}`;
      if (new RegExp(amountTokenPattern, "i").test(combined)) {
        candidates.push(combined);
        index += 1;
      }
    }
  }

  return candidates;
}

export function parseTransactionsFromPdfText(text: string): ParsedPdfRow[] {
  const rows: ParsedPdfRow[] = [];
  const candidates = collectCandidateLines(text);

  for (const line of candidates) {
    const parsed = parseLineToTransaction(line);
    if (!parsed) {
      continue;
    }

    rows.push({
      date: parsed.date,
      description: parsed.description,
      amount: parsed.amount,
      type: parsed.type,
      raw: {
        line,
        dateText: parsed.dateText,
        amountText: parsed.amountText
      }
    });
  }

  return rows;
}

async function loadPdfParseCtor(): Promise<new (params: { data: Buffer }) => {
  getText: (params: { lineEnforce: boolean }) => Promise<{ text: string }>;
  destroy: () => Promise<void>;
}> {
  const imported = (await import("pdf-parse")) as Record<string, unknown>;

  const candidate =
    (typeof imported.PDFParse === "function" ? imported.PDFParse : null) ??
    (typeof (imported.default as Record<string, unknown> | undefined)?.PDFParse === "function"
      ? (imported.default as Record<string, unknown>).PDFParse
      : null) ??
    (typeof imported.default === "function" ? imported.default : null);

  if (!candidate) {
    throw new Error("Modulo pdf-parse indisponivel neste ambiente.");
  }

  return candidate as new (params: { data: Buffer }) => {
    getText: (params: { lineEnforce: boolean }) => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdfRow[]> {
  const PDFParseCtor = await loadPdfParseCtor();
  const parser = new PDFParseCtor({ data: buffer });

  try {
    const textResult = await parser.getText({
      lineEnforce: true
    });

    const parsedRows = parseTransactionsFromPdfText(textResult.text);
    if (parsedRows.length === 0) {
      throw new Error(
        "Nao foi possivel extrair transacoes desse PDF automaticamente. Tente CSV/OFX ou outro modelo de PDF."
      );
    }

    return parsedRows;
  } finally {
    await parser.destroy();
  }
}
