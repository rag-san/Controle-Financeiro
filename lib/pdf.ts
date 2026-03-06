import { createRequire } from "node:module";
import { parseFlexibleDate } from "@/lib/normalize";
import { parseMoneyInput } from "@/lib/money";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { fixCommonMojibake, normalizeImportText, normalizeImportTextForMatch } from "@/lib/import-text";

export type ParsedPdfRow = {
  date: Date;
  balanceAfter?: number | null;
  transactionKindRaw: string;
  counterpartyRaw: string;
  transactionKindNorm: string;
  counterpartyNorm: string;
  merchantKey: string;
  sourceType: "pdf";
  documentType: PdfDocumentType;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  externalId?: string;
  accountHint?: string;
  raw: Record<string, unknown>;
};

type ParsedPdfCandidate = {
  date: Date;
  balanceAfter?: number | null;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  externalId?: string;
  accountHint?: string;
  raw: {
    line: string;
    dateText: string;
    amountText: string;
    [key: string]: unknown;
  };
};

export type PdfDocumentType = "bank_statement" | "credit_card_invoice" | "unknown";
export type PdfIssuerProfile =
  | "inter_statement"
  | "inter_invoice"
  | "mercado_pago_invoice"
  | "mercado_pago_statement"
  | "nubank_invoice"
  | "unknown";
export const SUPPORTED_PDF_ISSUER_PROFILES: PdfIssuerProfile[] = [
  "inter_statement",
  "inter_invoice",
  "mercado_pago_invoice",
  "mercado_pago_statement",
  "nubank_invoice"
];
export type PdfImportErrorCode =
  | "password_required"
  | "password_invalid"
  | "parser_unavailable"
  | "unsupported_issuer_profile"
  | "no_transactions_found";

export type PdfParseOptions = {
  password?: string;
};

export type PdfImportResult = {
  transactions: ParsedPdfRow[];
  documentType: PdfDocumentType;
  issuerProfile: PdfIssuerProfile;
  metadata: Record<string, string | number | boolean | null>;
};

export class PdfImportError extends Error {
  readonly code: PdfImportErrorCode;
  readonly technicalReason?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PdfImportErrorCode,
    message: string,
    technicalReason?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PdfImportError";
    this.code = code;
    this.technicalReason = technicalReason;
    this.details = details;
  }
}

const amountWithCurrencyPattern =
  /(?:[-+]?\s*R\$\s*|R\$\s*[-+]?\s*)(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/gi;
const ignoreDescriptionRegex = /\b(SALDO\s+ANTERIOR|SALDO\s+FINAL|SALDO\s+DISPON[IÍ]VEL|SALDO\s+DO\s+DIA)\b/i;
const portugueseMonthMap: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fev: 2,
  fevereiro: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12
};

const localRequire = createRequire(import.meta.url);

function normalizeLine(line: string): string {
  return normalizeImportText(fixCommonMojibake(line), {
    uppercase: false,
    stripAccents: false,
    removeNoise: false
  })
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string): string {
  return normalizeImportTextForMatch(value);
}

function parsePortugueseMonthToken(monthToken: string): number | null {
  const normalized = monthToken
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();

  return portugueseMonthMap[normalized] ?? null;
}

function parsePortugueseWordDate(day: number, monthToken: string, year: number): Date {
  const month = parsePortugueseMonthToken(monthToken);
  if (!month) {
    throw new Error(`Mês inválido no PDF: ${monthToken}`);
  }

  const dayText = String(day).padStart(2, "0");
  const monthText = String(month).padStart(2, "0");
  return parseFlexibleDate(`${dayText}/${monthText}/${year}`);
}

export function classifyPdfText(text: string): {
  documentType: PdfDocumentType;
  issuerProfile: PdfIssuerProfile;
} {
  const normalized = normalizeText(text);
  const hasInter = normalized.includes("BANCO INTER");
  const hasMercadoPago = normalized.includes("MERCADO PAGO");
  const hasNubank = normalized.includes("NUBANK") || normalized.includes(" APP DO NU");
  const hasInvoiceHints = normalized.includes("FATURA") && normalized.includes("VENCIMENTO");
  const hasStatementHints = normalized.includes("SALDO DO DIA") || normalized.includes("EXTRATO CONTA CORRENTE");
  const hasMercadoPagoStatementHints =
    normalized.includes("EXTRATO DE CONTA") &&
    normalized.includes("DETALHE DOS MOVIMENTOS") &&
    (normalized.includes("ID DA OPERA") ||
      normalized.includes("VALOR SALDO") ||
      /\b\d{2}-\d{2}-\d{4}\b/.test(normalized));

  if (hasInter && normalized.includes("DESPESAS DA FATURA")) {
    return {
      documentType: "credit_card_invoice",
      issuerProfile: "inter_invoice"
    };
  }

  if (hasInter && hasStatementHints && normalized.includes("PIX")) {
    return {
      documentType: "bank_statement",
      issuerProfile: "inter_statement"
    };
  }

  if (hasMercadoPago && normalized.includes("DETALHES DE CONSUMO")) {
    return {
      documentType: "credit_card_invoice",
      issuerProfile: "mercado_pago_invoice"
    };
  }

  if (hasMercadoPago && hasMercadoPagoStatementHints) {
    return {
      documentType: "bank_statement",
      issuerProfile: "mercado_pago_statement"
    };
  }

  if (hasNubank && hasInvoiceHints) {
    return {
      documentType: "credit_card_invoice",
      issuerProfile: "nubank_invoice"
    };
  }

  if (hasInvoiceHints) {
    return {
      documentType: "credit_card_invoice",
      issuerProfile: "unknown"
    };
  }

  if (hasStatementHints) {
    return {
      documentType: "bank_statement",
      issuerProfile: "unknown"
    };
  }

  return {
    documentType: "unknown",
    issuerProfile: "unknown"
  };
}

function shouldIgnoreInterStatementLine(line: string): boolean {
  if (!line) return true;
  if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) return true;
  if (/^Fale com a gente$/i.test(line)) return true;
  if (/^SAC:/i.test(line)) return true;
  if (/^Solicitado em:/i.test(line)) return true;
  if (/^CPF\/CNPJ:/i.test(line)) return true;
  if (/^Periodo:/i.test(normalizeText(line))) return true;
  if (/Saldo do dia:/i.test(line)) return true;
  if (/^Saldo (total|disponivel|bloqueado)/i.test(normalizeText(line))) return true;
  if (/^Valor Saldo por transacao/i.test(normalizeText(line))) return true;
  return false;
}

function parseInterStatementTransactions(text: string): ParsedPdfCandidate[] {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows: ParsedPdfCandidate[] = [];
  let currentDate: Date | null = null;
  let currentDateText = "";

  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ.]+)\s+de\s+(\d{4})/i);
    if (dateMatch) {
      const day = Number(dateMatch[1]);
      const monthToken = dateMatch[2];
      const year = Number(dateMatch[3]);
      currentDate = parsePortugueseWordDate(day, monthToken, year);
      currentDateText = `${String(day).padStart(2, "0")}/${String(parsePortugueseMonthToken(monthToken) ?? 0).padStart(2, "0")}/${year}`;
    }

    if (!currentDate || shouldIgnoreInterStatementLine(line)) {
      continue;
    }

    const amountMatches = [...line.matchAll(amountWithCurrencyPattern)].map((match) => match[0]);
    if (amountMatches.length === 0) {
      continue;
    }

    const amountText = amountMatches[0];
    const amountIndex = line.indexOf(amountText);
    if (amountIndex <= 0) {
      continue;
    }

    let description = line.slice(0, amountIndex).trim();
    description = description
      .replace(/^Valor Saldo por transacao\s*/i, "")
      .replace(/\s*:\s*$/, "")
      .trim();

    if (!description || ignoreDescriptionRegex.test(description)) {
      continue;
    }

    const amount = parseMoneyInput(amountText);
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) {
      continue;
    }

    rows.push({
      date: new Date(currentDate.getTime()),
      description,
      amount,
      type: amount >= 0 ? "income" : "expense",
      raw: {
        line,
        dateText: currentDateText || currentDate.toISOString(),
        amountText
      }
    });
  }

  return rows;
}

function parseInterInvoiceTransactions(text: string): ParsedPdfCandidate[] {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows: ParsedPdfCandidate[] = [];

  for (const line of lines) {
    if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) continue;
    if (/^Total CARTAO/i.test(normalizeText(line))) continue;
    if (/^Total\b/i.test(line)) continue;
    if (/^Data Movimentacao Beneficiario Valor$/i.test(normalizeText(line))) continue;

    const datePrefixMatch = line.match(/^(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})\s+/i);
    if (!datePrefixMatch) {
      continue;
    }

    const day = Number(datePrefixMatch[1]);
    const monthToken = datePrefixMatch[2];
    const year = Number(datePrefixMatch[3]);
    const rest = line.slice(datePrefixMatch[0].length).trim();
    if (!rest) continue;

    const amountMatches = [...rest.matchAll(/R\$\s*[\d.,\s]+/gi)];
    if (amountMatches.length === 0) {
      continue;
    }

    const lastAmount = amountMatches[amountMatches.length - 1];
    const amountText = lastAmount[0];
    const amountIndex = lastAmount.index ?? -1;
    if (amountIndex <= 0) {
      continue;
    }

    let description = rest.slice(0, amountIndex).trim();
    description = description.replace(/(?:[-+]\s*)+$/, "").trim();
    if (!description || /^Total\b/i.test(description)) {
      continue;
    }

    const absolute = Math.abs(parseMoneyInput(amountText));
    if (!Number.isFinite(absolute) || Math.abs(absolute) < 0.01) {
      continue;
    }

    const positive =
      /\+\s*R\$/i.test(rest) ||
      /\b(PAGAMENTO|ESTORNO|CREDITO|DEVOLUCAO)\b/i.test(normalizeText(description));
    const amount = positive ? absolute : -absolute;
    const date = parsePortugueseWordDate(day, monthToken, year);

    rows.push({
      date,
      description,
      amount,
      type: amount >= 0 ? "income" : "expense",
      raw: {
        line,
        dateText: `${String(day).padStart(2, "0")}/${String(parsePortugueseMonthToken(monthToken) ?? 0).padStart(2, "0")}/${year}`,
        amountText
      }
    });
  }

  return rows;
}

function parseMercadoPagoInvoiceTransactions(
  text: string,
  dueDate: Date | null
): ParsedPdfCandidate[] {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows: ParsedPdfCandidate[] = [];

  const dueMonth = dueDate ? dueDate.getMonth() + 1 : null;
  const dueYear = dueDate ? dueDate.getFullYear() : new Date().getFullYear();

  for (const line of lines) {
    if (/^Total R\$/i.test(line)) continue;

    const match = line.match(/^(\d{2})\/(\d{2})\s+(.+?)\s+R\$\s*([\d.,]+)$/i);
    if (!match) {
      continue;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const description = match[3].trim();
    const amountText = `R$ ${match[4]}`;

    if (!description || /^Total\b/i.test(description)) {
      continue;
    }

    if (/^Pagamento da fatura/i.test(description)) {
      continue;
    }

    let year = dueYear;
    if (dueMonth && month > dueMonth) {
      year -= 1;
    }

    const date = parseFlexibleDate(`${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`);
    const absolute = Math.abs(parseMoneyInput(amountText));
    if (!Number.isFinite(absolute) || Math.abs(absolute) < 0.01) {
      continue;
    }

    const positive = /\b(ESTORNO|CREDITO|DEVOLUCAO|AJUSTE A FAVOR)\b/i.test(normalizeText(description));
    const amount = positive ? absolute : -absolute;

    rows.push({
      date,
      description,
      amount,
      type: amount >= 0 ? "income" : "expense",
      raw: {
        line,
        dateText: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
        amountText
      }
    });
  }

  return rows;
}

function normalizeMoneyTokenForParse(value: string): string {
  return value.replace(/−/g, "-").replace(/\s+/g, " ").trim();
}

function shouldIgnoreMercadoPagoStatementLine(line: string): boolean {
  if (!line) return true;
  if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) return true;
  if (/^Data de gera[cç][aã]o:/i.test(line)) return true;
  if (/^EXTRATO DE CONTA$/i.test(normalizeText(line))) return true;
  if (/^DETALHE DOS MOVIMENTOS$/i.test(normalizeText(line))) return true;
  if (/^Data Descri[cç][aã]o ID da opera[cç][aã]o Valor Saldo$/i.test(line)) return true;
  if (/^Saldo (inicial|final):/i.test(line)) return true;
  if (/^CPF\/CNPJ:/i.test(line)) return true;
  if (/^Ag[eê]ncia:/i.test(line)) return true;
  if (/^Periodo:/i.test(line)) return true;
  if (/^Entradas:/i.test(line)) return true;
  if (/^Sa[ií]das:/i.test(line)) return true;
  if (/^Voc[eê]\s+tem\s+alguma\s+d[uú]vida/i.test(line)) return true;
  if (/^Mercado Pago Institui[cç][aã]o de Pagamento/i.test(line)) return true;
  return false;
}

function parseMercadoPagoStatementEntry(entry: string): ParsedPdfCandidate | null {
  const dateMatch = entry.match(/^(\d{2}-\d{2}-\d{4})\s+/);
  if (!dateMatch?.[1]) return null;

  const amountMatches = [...entry.matchAll(amountWithCurrencyPattern)];
  if (amountMatches.length < 2) {
    return null;
  }

  const amountText = amountMatches[0][0];
  const balanceText = amountMatches[1][0];
  const amountIndex = entry.indexOf(amountText);
  if (amountIndex <= 0) {
    return null;
  }

  const afterDate = entry.slice(dateMatch[0].length, amountIndex).trim();
  const idMatch = afterDate.match(/(\d{6,})\s*$/);
  const description = (idMatch ? afterDate.slice(0, idMatch.index) : afterDate).trim();

  if (!description) return null;
  if (/^Data\s+Descri[cç][aã]o/i.test(description)) return null;

  const amount = parseMoneyInput(normalizeMoneyTokenForParse(amountText));
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) {
    return null;
  }

  const balanceAfter = parseMoneyInput(normalizeMoneyTokenForParse(balanceText));
  const date = parseFlexibleDate(dateMatch[1].replace(/-/g, "/"));
  const operationId = idMatch?.[1] ?? null;

  return {
    date,
    balanceAfter,
    description,
    amount,
    type: amount >= 0 ? "income" : "expense",
    externalId: operationId ?? undefined,
    raw: {
      line: entry,
      dateText: dateMatch[1],
      amountText,
      balanceText,
      operationId
    }
  };
}

function parseMercadoPagoStatementTransactions(text: string): ParsedPdfCandidate[] {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows: ParsedPdfCandidate[] = [];
  const seen = new Set<string>();
  let pendingParts: string[] = [];

  const flushPending = (): void => {
    if (pendingParts.length === 0) return;
    const entry = pendingParts.join(" ").replace(/\s+/g, " ").trim();
    pendingParts = [];
    if (!entry) return;

    const parsed = parseMercadoPagoStatementEntry(entry);
    if (!parsed) return;

    const operationId =
      typeof parsed.raw.operationId === "string" ? parsed.raw.operationId : "";
    const fallbackDescription = normalizeText(parsed.description);
    const dedupeKey = `${parsed.raw.dateText}|${operationId || fallbackDescription}|${parsed.raw.amountText}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    rows.push(parsed);
  };

  for (const line of lines) {
    if (shouldIgnoreMercadoPagoStatementLine(line)) {
      flushPending();
      continue;
    }

    if (/^\d{2}-\d{2}-\d{4}\b/.test(line)) {
      flushPending();
      pendingParts = [line];
      continue;
    }

    if (pendingParts.length > 0) {
      pendingParts.push(line);
    }
  }

  flushPending();

  return rows;
}

function isNubankMonthLine(value: string): RegExpMatchArray | null {
  return value.match(/^(\d{2})\s+([A-Za-zÀ-ÿ.]{3,10})\s+(.+)$/i);
}

function resolveInvoiceYearForMonth(
  month: number,
  dueDate: Date | null
): number {
  const dueMonth = dueDate ? dueDate.getMonth() + 1 : null;
  const dueYear = dueDate ? dueDate.getFullYear() : new Date().getFullYear();

  if (dueMonth && month > dueMonth) {
    return dueYear - 1;
  }

  return dueYear;
}

function parseNubankInvoiceTransactions(text: string, dueDate: Date | null): ParsedPdfCandidate[] {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows: ParsedPdfCandidate[] = [];
  let pending:
    | {
        day: number;
        monthToken: string;
        description: string;
        line: string;
      }
    | null = null;

  const flushPending = (amountText: string): void => {
    if (!pending) return;

    const day = pending.day;
    const month = parsePortugueseMonthToken(pending.monthToken);
    if (!month) {
      pending = null;
      return;
    }

    const year = resolveInvoiceYearForMonth(month, dueDate);
    const date = parseFlexibleDate(
      `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
    );
    const normalizedDescription = normalizeText(pending.description);
    const isPaymentLine =
      /\bPAGAMENTO\s+EM\b/.test(normalizedDescription) ||
      /\bPAGAMENTO\s+RECEBIDO\b/.test(normalizedDescription);
    const isCreditLine = /\b(ESTORNO|CREDITO|DEVOLUCAO|AJUSTE A FAVOR)\b/.test(normalizedDescription);
    const absolute = Math.abs(parseMoneyInput(normalizeMoneyTokenForParse(amountText)));

    if (!Number.isFinite(absolute) || Math.abs(absolute) < 0.01) {
      pending = null;
      return;
    }

    const amount = isPaymentLine || isCreditLine ? absolute : -absolute;
    rows.push({
      date,
      description: pending.description,
      amount,
      type: amount >= 0 ? "income" : "expense",
      raw: {
        line: pending.line,
        dateText: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
        amountText
      }
    });

    pending = null;
  };

  for (const line of lines) {
    if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) continue;
    if (/^\d+\s+de\s+\d+$/i.test(normalizeText(line))) continue;
    if (/^(FATURA|RESUMO DA FATURA|PROXIMAS FATURAS|LIMITES DISPONIVEIS|VALOR MAXIMO)/i.test(normalizeText(line))) {
      continue;
    }
    if (/^TRANSA(C|Ç)OES?\s+DE\s+/i.test(normalizeText(line))) continue;
    if (/^Total a pagar:/i.test(line)) continue;

    if (pending && /^[−-]?\s*R\$\s*[\d.,]+$/i.test(line)) {
      flushPending(line);
      continue;
    }

    const inline = line.match(
      /^(\d{2})\s+([A-Za-zÀ-ÿ.]{3,10})\s+(.+?)\s+([−-]?\s*R\$\s*[\d.,]+)$/i
    );
    if (inline) {
      pending = {
        day: Number(inline[1]),
        monthToken: inline[2],
        description: inline[3].trim(),
        line
      };
      flushPending(inline[4]);
      continue;
    }

    const monthLine = isNubankMonthLine(line);
    if (monthLine) {
      pending = {
        day: Number(monthLine[1]),
        monthToken: monthLine[2],
        description: monthLine[3].trim(),
        line
      };
      continue;
    }
  }

  return rows;
}

function extractPeriodMetadata(text: string): { from: string; to: string } | null {
  const match = text.match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (!match) return null;
  return {
    from: match[1],
    to: match[2]
  };
}

function extractDueDateMetadata(text: string): Date | null {
  const match = text.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (match?.[1]) {
    try {
      return parseFlexibleDate(match[1]);
    } catch {
      return null;
    }
  }

  const monthTextMatch = text.match(/Data de vencimento:\s*(\d{2})\s+([A-Za-zÀ-ÿ.]{3,10})\s+(\d{4})/i);
  if (!monthTextMatch?.[1] || !monthTextMatch[2] || !monthTextMatch[3]) {
    return null;
  }

  const day = Number(monthTextMatch[1]);
  const month = parsePortugueseMonthToken(monthTextMatch[2]);
  const year = Number(monthTextMatch[3]);

  if (!month) {
    return null;
  }

  try {
    return parseFlexibleDate(
      `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
    );
  } catch {
    return null;
  }
}

function buildPdfMetadata(
  text: string,
  classification: { documentType: PdfDocumentType; issuerProfile: PdfIssuerProfile }
): Record<string, string | number | boolean | null> {
  const metadata: Record<string, string | number | boolean | null> = {};
  const period = extractPeriodMetadata(text);
  const dueDate = extractDueDateMetadata(text);
  const accountMatch = text.match(/Conta:\s*([0-9\-]+)/i);

  metadata.documentType = classification.documentType;
  metadata.issuerProfile = classification.issuerProfile;
  metadata.statementFrom = period?.from ?? null;
  metadata.statementTo = period?.to ?? null;
  metadata.dueDate = dueDate ? dueDate.toISOString() : null;
  metadata.accountHint = accountMatch?.[1] ?? null;

  return metadata;
}

function mapPdfError(error: unknown): PdfImportError {
  if (error instanceof PdfImportError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  if (lowered.includes("no password given")) {
    return new PdfImportError(
      "password_required",
      "Este PDF está protegido por senha. Informe a senha para continuar.",
      message
    );
  }

  if (lowered.includes("incorrect password") || lowered.includes("invalid password") || lowered.includes("wrong password")) {
    return new PdfImportError("password_invalid", "Senha do PDF inválida.", message);
  }

  return new PdfImportError(
    "parser_unavailable",
    "Não foi possível processar este PDF automaticamente.",
    message
  );
}

function decodePdfLiteralString(value: string): string {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      decoded += char;
      continue;
    }

    const next = value[index + 1];
    if (!next) {
      decoded += "\\";
      continue;
    }

    if (next === "n") {
      decoded += "\n";
      index += 1;
      continue;
    }
    if (next === "r") {
      decoded += "\r";
      index += 1;
      continue;
    }
    if (next === "t") {
      decoded += "\t";
      index += 1;
      continue;
    }
    if (next === "b") {
      decoded += "\b";
      index += 1;
      continue;
    }
    if (next === "f") {
      decoded += "\f";
      index += 1;
      continue;
    }
    if (next === "\\" || next === "(" || next === ")") {
      decoded += next;
      index += 1;
      continue;
    }

    decoded += next;
    index += 1;
  }

  return decoded;
}

function extractTextFromSimplePdfBuffer(buffer: Buffer): string | null {
  const raw = buffer.toString("latin1");
  const matches = [...raw.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)];
  if (matches.length === 0) {
    return null;
  }

  const lines = matches
    .map((match) => match[0].replace(/\s*Tj$/, "").trim())
    .filter((chunk) => chunk.startsWith("(") && chunk.endsWith(")"))
    .map((chunk) => decodePdfLiteralString(chunk.slice(1, -1)).trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines.join("\n") : null;
}

type PdfParseClassInstance = {
  getText: (params: { lineEnforce: boolean }) => Promise<{ text?: string }>;
  destroy: () => Promise<void>;
};

type PdfParseClassCtor = new (params: { data: Buffer; password?: string }) => PdfParseClassInstance;

type PdfParseFunctionResult = {
  text?: string;
};

type PdfParseFunction = (
  data: Buffer,
  options?: {
    password?: string;
  }
) => Promise<PdfParseFunctionResult> | PdfParseFunctionResult;

type PdfJsTextItem = {
  str?: unknown;
};

type PdfJsTextContent = {
  items?: PdfJsTextItem[];
};

type PdfJsPage = {
  getTextContent: () => Promise<PdfJsTextContent>;
};

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
};

type PdfJsLoadingTask = {
  promise: Promise<PdfJsDocument>;
  destroy?: () => Promise<void> | void;
};

type PdfJsModule = {
  getDocument: (params: {
    data: Uint8Array;
    password?: string;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
    stopAtErrors?: boolean;
  }) => PdfJsLoadingTask;
};

function isPdfJsModule(value: unknown): value is PdfJsModule {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as { getDocument?: unknown }).getDocument === "function";
}

function isPdfParseClassCtor(value: unknown): value is PdfParseClassCtor {
  if (typeof value !== "function") {
    return false;
  }

  const maybePrototype = (value as { prototype?: { getText?: unknown } }).prototype;
  return typeof maybePrototype?.getText === "function";
}

function resolvePdfParseClassCtor(imported: Record<string, unknown>): PdfParseClassCtor | null {
  const defaultExport = imported.default as Record<string, unknown> | undefined;
  const candidates: unknown[] = [imported.PDFParse, defaultExport?.PDFParse];

  for (const candidate of candidates) {
    if (isPdfParseClassCtor(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolvePdfParseFunction(imported: Record<string, unknown>): PdfParseFunction | null {
  if (typeof imported.default === "function") {
    return imported.default as PdfParseFunction;
  }

  if (typeof imported.pdf === "function") {
    return imported.pdf as PdfParseFunction;
  }

  if (typeof imported.parse === "function") {
    return imported.parse as PdfParseFunction;
  }

  return null;
}

async function extractTextWithPdfParse(buffer: Buffer, options: PdfParseOptions): Promise<string> {
  let imported: Record<string, unknown> | null = null;

  try {
    imported = localRequire("pdf-parse") as Record<string, unknown>;
  } catch {
    imported = null;
  }

  if (!imported) {
    imported = (await import("pdf-parse")) as Record<string, unknown>;
  }

  const classCtor = resolvePdfParseClassCtor(imported);
  if (classCtor) {
    let parser: PdfParseClassInstance | null = null;
    try {
      parser = new classCtor({
        data: buffer,
        password: options.password
      });

      const textResult = await parser.getText({
        lineEnforce: true
      });
      return fixCommonMojibake(textResult.text ?? "");
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  const parseFn = resolvePdfParseFunction(imported);
  if (parseFn) {
    const result = await parseFn(
      buffer,
      options.password
        ? {
            password: options.password
          }
        : undefined
    );
    const text = typeof result?.text === "string" ? result.text : "";
    return fixCommonMojibake(text);
  }

  throw new PdfImportError("parser_unavailable", "Módulo pdf-parse indisponível neste ambiente.");
}

async function extractTextWithPdfJs(buffer: Buffer, options: PdfParseOptions): Promise<string> {
  const imported = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown;
  if (!isPdfJsModule(imported)) {
    throw new PdfImportError("parser_unavailable", "Módulo pdfjs-dist indisponível neste ambiente.");
  }

  const loadingTask = imported.getDocument({
    data: new Uint8Array(buffer),
    password: options.password,
    useSystemFonts: true,
    isEvalSupported: false,
    stopAtErrors: false
  });

  try {
    const document = await loadingTask.promise;
    const chunks: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = (content.items ?? [])
        .map((item) => (typeof item.str === "string" ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        chunks.push(text);
      }
    }

    return fixCommonMojibake(chunks.join("\n"));
  } finally {
    await loadingTask.destroy?.();
  }
}

export async function parsePdfImport(
  buffer: Buffer,
  options: PdfParseOptions = {}
): Promise<PdfImportResult> {
  let text = "";

  try {
    text = await extractTextWithPdfParse(buffer, options);
  } catch (primaryError) {
    const mappedPrimaryError = mapPdfError(primaryError);
    if (mappedPrimaryError.code === "password_required" || mappedPrimaryError.code === "password_invalid") {
      throw mappedPrimaryError;
    }

    try {
      text = await extractTextWithPdfJs(buffer, options);
    } catch (secondaryError) {
      const mappedSecondaryError = mapPdfError(secondaryError);
      const fallbackText = extractTextFromSimplePdfBuffer(buffer);

      if (!fallbackText) {
        throw new PdfImportError(
          "parser_unavailable",
          mappedSecondaryError.message,
          [mappedPrimaryError.technicalReason, mappedSecondaryError.technicalReason].filter(Boolean).join(" | ")
        );
      }

      text = fixCommonMojibake(fallbackText);
    }
  }

  const classification = classifyPdfText(text);
  const metadata = buildPdfMetadata(text, classification);
  const dueDate = extractDueDateMetadata(text);

  let parsedTransactions: ParsedPdfCandidate[] = [];

  if (classification.issuerProfile === "inter_statement") {
    parsedTransactions = parseInterStatementTransactions(text);
  } else if (classification.issuerProfile === "inter_invoice") {
    parsedTransactions = parseInterInvoiceTransactions(text);
  } else if (classification.issuerProfile === "mercado_pago_invoice") {
    parsedTransactions = parseMercadoPagoInvoiceTransactions(text, dueDate);
  } else if (classification.issuerProfile === "mercado_pago_statement") {
    parsedTransactions = parseMercadoPagoStatementTransactions(text);
  } else if (classification.issuerProfile === "nubank_invoice") {
    parsedTransactions = parseNubankInvoiceTransactions(text, dueDate);
  } else {
    throw new PdfImportError(
      "unsupported_issuer_profile",
      "PDF reconhecido, mas o emissor/layout ainda não possui parser dedicado. Tente CSV/OFX.",
      `issuer_profile=${classification.issuerProfile}`,
      {
        issuerProfile: classification.issuerProfile,
        documentType: classification.documentType,
        supportedIssuerProfiles: SUPPORTED_PDF_ISSUER_PROFILES
      }
    );
  }

  if (parsedTransactions.length === 0) {
    throw new PdfImportError(
      "no_transactions_found",
      "Não foi possível extrair transações desse PDF automaticamente. Tente CSV/OFX ou outro modelo de PDF."
    );
  }

  const transactions = parsedTransactions.map((row) => {
    const canonical = toCanonicalImportRow({
      date: row.date,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      type: row.type,
      sourceType: "pdf",
      documentType: classification.documentType,
      description: row.description,
      externalId: row.externalId,
      accountHint: row.accountHint,
      raw: row.raw
    });

    return {
      ...canonical,
      sourceType: "pdf",
      documentType: classification.documentType
    } satisfies ParsedPdfRow;
  });

  return {
    transactions,
    documentType: classification.documentType,
    issuerProfile: classification.issuerProfile,
    metadata
  };
}

