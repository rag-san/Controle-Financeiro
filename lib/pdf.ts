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
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
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
  type: "income" | "expense" | "transfer";
  dateText: string;
  amountText: string;
};

export type PdfDocumentType = "bank_statement" | "credit_card_invoice" | "unknown";
export type PdfIssuerProfile = "inter_statement" | "inter_invoice" | "mercado_pago_invoice" | "unknown";
export const SUPPORTED_PDF_ISSUER_PROFILES: PdfIssuerProfile[] = [
  "inter_statement",
  "inter_invoice",
  "mercado_pago_invoice"
];
export type PdfImportErrorCode =
  | "password_required"
  | "password_invalid"
  | "parser_unavailable"
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

  constructor(code: PdfImportErrorCode, message: string, technicalReason?: string) {
    super(message);
    this.name = "PdfImportError";
    this.code = code;
    this.technicalReason = technicalReason;
  }
}

const dateRegex = /\b(\d{2}\/\d{2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const amountTokenPattern = String.raw`[+-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})(?:\s*[CD])?`;
const amountWithCurrencyPattern = /[-+]?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/gi;
const ignoreDescriptionRegex = /\b(SALDO\s+ANTERIOR|SALDO\s+FINAL|SALDO\s+DISPON[IÍ]VEL|SALDO\s+DO\s+DIA)\b/i;
const PDFJS_WORKER_MODULE_SPECIFIER = "pdfjs-dist/legacy/build/pdf.worker.mjs";

let pdfWorkerConfigured = false;

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

function normalizeShortDate(value: string): string {
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
    return value;
  }

  const [dd, mm, yy] = value.split("/");
  const year = Number(yy);
  const fullYear = year >= 70 ? `19${yy}` : `20${yy}`;
  return `${dd}/${mm}/${fullYear}`;
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
    throw new Error(`Mes invalido no PDF: ${monthToken}`);
  }

  const dayText = String(day).padStart(2, "0");
  const monthText = String(month).padStart(2, "0");
  return parseFlexibleDate(`${dayText}/${monthText}/${year}`);
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
  const lines = text.split(/\r?\n/).map(normalizeLine).filter((line) => line.length > 0);
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

function classifyPdfDocument(text: string): {
  documentType: PdfDocumentType;
  issuerProfile: PdfIssuerProfile;
} {
  const normalized = normalizeText(text);
  const hasInter = normalized.includes("BANCO INTER");
  const hasMercadoPago = normalized.includes("MERCADO PAGO");
  const hasInvoiceHints = normalized.includes("FATURA") && normalized.includes("VENCIMENTO");
  const hasStatementHints = normalized.includes("SALDO DO DIA") || normalized.includes("EXTRATO CONTA CORRENTE");

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
  if (!match?.[1]) return null;
  try {
    return parseFlexibleDate(match[1]);
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
      "Este PDF esta protegido por senha. Informe a senha para continuar.",
      message
    );
  }

  if (lowered.includes("incorrect password") || lowered.includes("invalid password") || lowered.includes("wrong password")) {
    return new PdfImportError("password_invalid", "Senha do PDF invalida.", message);
  }

  return new PdfImportError(
    "parser_unavailable",
    "Nao foi possivel processar este PDF automaticamente.",
    message
  );
}

export function parseTransactionsFromPdfText(text: string): ParsedPdfCandidate[] {
  const rows: ParsedPdfCandidate[] = [];
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

async function loadPdfParseCtor(): Promise<new (params: { data: Buffer; password?: string }) => {
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
    throw new PdfImportError("parser_unavailable", "Modulo pdf-parse indisponivel neste ambiente.");
  }

  return candidate as new (params: { data: Buffer; password?: string }) => {
    getText: (params: { lineEnforce: boolean }) => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  };
}

function configurePdfWorker(
  PDFParseCtor: new (params: { data: Buffer; password?: string }) => {
    getText: (params: { lineEnforce: boolean }) => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  }
): void {
  if (pdfWorkerConfigured) {
    return;
  }

  const withSetWorker = PDFParseCtor as unknown as {
    setWorker?: (workerSrc?: string) => string;
  };

  if (typeof withSetWorker.setWorker !== "function") {
    return;
  }

  try {
    withSetWorker.setWorker(PDFJS_WORKER_MODULE_SPECIFIER);
    pdfWorkerConfigured = true;
  } catch {
    // Keep default behavior if this runtime cannot override the worker source.
  }
}

export async function parsePdfImport(
  buffer: Buffer,
  options: PdfParseOptions = {}
): Promise<PdfImportResult> {
  const PDFParseCtor = await loadPdfParseCtor();
  configurePdfWorker(PDFParseCtor);
  const parser = new PDFParseCtor({
    data: buffer,
    password: options.password
  });

  try {
    const textResult = await parser.getText({
      lineEnforce: true
    });

    const text = fixCommonMojibake(textResult.text ?? "");
    const classification = classifyPdfDocument(text);
    const metadata = buildPdfMetadata(text, classification);
    const dueDate = extractDueDateMetadata(text);

    let parsedTransactions: ParsedPdfCandidate[] = [];

    if (classification.issuerProfile === "inter_statement") {
      parsedTransactions = parseInterStatementTransactions(text);
    } else if (classification.issuerProfile === "inter_invoice") {
      parsedTransactions = parseInterInvoiceTransactions(text);
    } else if (classification.issuerProfile === "mercado_pago_invoice") {
      parsedTransactions = parseMercadoPagoInvoiceTransactions(text, dueDate);
    } else {
      throw new PdfImportError(
        "parser_unavailable",
        "Suporte de PDF disponivel apenas para Banco Inter e Mercado Pago.",
        `issuer_profile=${classification.issuerProfile}`
      );
    }

    if (parsedTransactions.length === 0) {
      throw new PdfImportError(
        "no_transactions_found",
        "Nao foi possivel extrair transacoes desse PDF automaticamente. Tente CSV/OFX ou outro modelo de PDF."
      );
    }

    const transactions = parsedTransactions.map((row) => {
      const canonical = toCanonicalImportRow({
        date: row.date,
        amount: row.amount,
        type: row.type,
        sourceType: "pdf",
        documentType: classification.documentType,
        description: row.description,
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
  } catch (error) {
    throw mapPdfError(error);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function parsePdfBuffer(buffer: Buffer, options: PdfParseOptions = {}): Promise<ParsedPdfRow[]> {
  const parsed = await parsePdfImport(buffer, options);
  return parsed.transactions;
}
