import { parseStrictMoneyInput } from "@/lib/money";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { type ImportTextEncoding, decodeImportText, fixCommonMojibake } from "@/lib/import-text";
import { toCanonicalImportRow } from "@/lib/import-canonical";

export type CsvParseResult = {
  columns: string[];
  rows: Record<string, string>[];
  delimiter: string;
  detectedEncoding: ImportTextEncoding;
};

export type CsvMapping = {
  date: string;
  description: string;
  history?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
  account?: string;
  balanceAfter?: string;
};

export type ParsedImportRow = {
  date: Date;
  balanceAfter?: number | null;
  transactionKindRaw: string;
  counterpartyRaw: string;
  transactionKindNorm: string;
  counterpartyNorm: string;
  merchantKey: string;
  sourceType: "csv";
  documentType?: null;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  externalId?: string;
  accountHint?: string;
  raw: Record<string, unknown>;
};

export type CsvRowStatus = "ok" | "ignored" | "error";

export type CsvRowReason =
  | "ok"
  | "missing_date"
  | "missing_description"
  | "missing_amount"
  | "invalid_amount"
  | "invalid_date"
  | "ignored_balance_row"
  | "zero_amount"
  | "invalid_normalized_row"
  | "row_parse_error";

export type CsvRowDiagnostic = {
  line: number;
  status: CsvRowStatus;
  reason: CsvRowReason;
  message: string;
  raw: Record<string, string>;
  mapped?: ParsedImportRow;
};

export type CsvMappingDiagnostics = {
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  errorRows: number;
  reasons: Record<string, number>;
};

export type CsvMappingAnalysis = {
  rows: ParsedImportRow[];
  diagnostics: CsvRowDiagnostic[];
  summary: CsvMappingDiagnostics;
};

function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  let bestCandidate = ",";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const matrix = splitCsvRows(sample, candidate).slice(0, 25);
    const viableRows = matrix.filter((row) => row.filter((cell) => sanitizeCell(cell).length > 0).length > 1);

    if (viableRows.length === 0) continue;

    const avgColumns = viableRows.reduce((sum, row) => sum + row.length, 0) / viableRows.length;
    const variance =
      viableRows.reduce((sum, row) => sum + (row.length - avgColumns) ** 2, 0) / Math.max(viableRows.length, 1);

    const score = viableRows.length * 10 + avgColumns - variance;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function splitCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      current = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function sanitizeCell(value: string): string {
  return fixCommonMojibake(value.replace(/^"|"$/g, "")).replace(/\s+/g, " ").trim();
}

const headerAliasKeywords = [
  "DATA",
  "DATE",
  "LANC",
  "POSTED",
  "DESCR",
  "HIST",
  "MEMO",
  "DETAIL",
  "VALOR",
  "AMOUNT",
  "DEBIT",
  "CREDIT",
  "CONTA",
  "ACCOUNT",
  "TIPO"
];

const ignoredDescriptionRegex =
  /\b(SALDO(?:\s+ANTERIOR|\s+FINAL|\s+DISPON[IÍ]VEL|\s+DO\s+DIA)?|TOTAL(?:\s+DO\s+DIA)?|RESUMO)\b/i;

function looksLikeHeaderCell(value: string): boolean {
  const normalized = normalizeDescription(value);
  return headerAliasKeywords.some((keyword) => normalized.includes(keyword));
}

function looksLikeDataRow(row: string[]): boolean {
  const joined = row.join(" ");
  const hasDate = /\b(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/.test(joined);
  const hasAmount = /[+-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})/.test(joined);
  return hasDate && hasAmount;
}

function findHeaderIndex(matrix: string[][]): number {
  const inspected = matrix.slice(0, 30);
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  inspected.forEach((row, index) => {
    const nonEmpty = row.filter((cell) => sanitizeCell(cell).length > 0).length;
    if (nonEmpty < 2) return;

    const headerHits = row.filter((cell) => looksLikeHeaderCell(cell)).length;
    const hasDataSignature = looksLikeDataRow(row);
    const score = nonEmpty + headerHits * 3 - (hasDataSignature ? 2 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function buildColumns(headerRow: string[]): string[] {
  const seen = new Map<string, number>();

  return headerRow.map((cell, index) => {
    const base = sanitizeCell(cell) || `col_${index + 1}`;
    const key = normalizeDescription(base);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count > 1 ? `${base}_${count}` : base;
  });
}

function isRepeatedHeaderRow(row: Record<string, string>, columns: string[]): boolean {
  if (columns.length === 0) return false;

  let matches = 0;
  columns.forEach((column) => {
    const expected = normalizeDescription(column);
    const actual = normalizeDescription(row[column] ?? "");
    if (expected && actual && expected === actual) {
      matches += 1;
    }
  });

  return matches >= Math.max(2, Math.ceil(columns.length * 0.6));
}

export function parseCsvBuffer(buffer: Buffer): CsvParseResult {
  const { text: decodedText, encoding } = decodeImportText(buffer);
  const text = fixCommonMojibake(decodedText);
  const delimiter = detectDelimiter(text.slice(0, 2000));
  const matrix = splitCsvRows(text, delimiter);

  if (matrix.length === 0) {
    return {
      columns: [],
      rows: [],
      delimiter,
      detectedEncoding: encoding
    };
  }

  const headerIndex = findHeaderIndex(matrix);
  const columns = buildColumns(matrix[headerIndex] ?? matrix[0] ?? []);

  const rows = matrix
    .slice(headerIndex + 1)
    .map((record) => {
      const row: Record<string, string> = {};
      columns.forEach((column, index) => {
        row[column] = sanitizeCell(record[index] ?? "");
      });
      return row;
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0))
    .filter((row) => !isRepeatedHeaderRow(row, columns));

  return {
    columns,
    rows,
    delimiter,
    detectedEncoding: encoding
  };
}

function pickColumn(columns: string[], aliases: string[], avoidAliases: string[] = []): string | undefined {
  const normalizedColumns = columns.map((column) => normalizeDescription(column));
  const normalizedAliases = aliases.map((alias) => normalizeDescription(alias));
  const normalizedAvoid = avoidAliases.map((alias) => normalizeDescription(alias));

  const eligible = normalizedColumns
    .map((column, index) => ({ column, original: columns[index] }))
    .filter(
      ({ column }) =>
        !normalizedAvoid.some((avoid) => avoid.length > 0 && (column.includes(avoid) || avoid.includes(column)))
    );

  const exact = eligible.find(({ column }) => normalizedAliases.includes(column));
  if (exact) return exact.original;

  const contains = eligible.find(({ column }) => normalizedAliases.some((alias) => column.includes(alias)));
  if (contains) return contains.original;

  return undefined;
}

export function suggestCsvMapping(columns: string[]): Partial<CsvMapping> {
  const amount = pickColumn(columns, ["valor", "amount", "vlr", "valor lancado", "valor final"], ["saldo"]);
  const debit = pickColumn(columns, ["debito", "débito", "saida", "saída", "valor debito", "valor débito"], ["saldo"]);
  const credit = pickColumn(columns, ["credito", "crédito", "entrada", "valor credito", "valor crédito"], ["saldo"]);
  const history = pickColumn(columns, ["historico", "histórico", "history", "tipo lancamento", "tipo transacao"], [
    "descri"
  ]);
  const description =
    pickColumn(columns, [
      "descricao",
      "descrição",
      "description",
      "beneficiario",
      "beneficiário",
      "favorecido",
      "destino",
      "estabelecimento",
      "memo",
      "name",
      "details",
      "narrative"
    ]) ??
    columns.find((column) => {
      const normalized = normalizeDescription(column);
      return normalized.includes("DESCRI") || normalized.includes("BENEF") || normalized.includes("DESTIN");
    }) ??
    history;

  return {
    date: pickColumn(columns, ["data", "date", "dt", "lancamento", "lançamento", "posted"]),
    description,
    history,
    amount,
    debit,
    credit,
    type: pickColumn(columns, ["tipo", "type", "natureza", "debito_credito", "d/c"]),
    account: pickColumn(columns, ["conta", "account", "bank", "cartao"]),
    balanceAfter: pickColumn(columns, ["saldo", "saldo final", "balance", "balance after", "saldo apos"])
  };
}

type ResolvedAmount =
  | { kind: "ok"; amount: number }
  | { kind: "missing" }
  | { kind: "invalid" };

function resolveAmountValue(raw: Record<string, string>, mapping: CsvMapping): ResolvedAmount {
  if (mapping.amount) {
    const amountValue = raw[mapping.amount];
    if (!amountValue || amountValue.trim().length === 0) {
      return { kind: "missing" };
    }

    const parsedAmount = parseStrictMoneyInput(amountValue);
    if (parsedAmount === null) {
      return { kind: "invalid" };
    }

    return { kind: "ok", amount: parsedAmount };
  }

  const debitRaw = mapping.debit ? raw[mapping.debit] ?? "" : "";
  const creditRaw = mapping.credit ? raw[mapping.credit] ?? "" : "";
  const hasDebit = debitRaw.trim().length > 0;
  const hasCredit = creditRaw.trim().length > 0;

  if (!hasDebit && !hasCredit) {
    return { kind: "missing" };
  }

  const parsedDebit = hasDebit ? parseStrictMoneyInput(debitRaw) : 0;
  const parsedCredit = hasCredit ? parseStrictMoneyInput(creditRaw) : 0;

  if ((hasDebit && parsedDebit === null) || (hasCredit && parsedCredit === null)) {
    return { kind: "invalid" };
  }

  const debit = hasDebit ? Math.abs(parsedDebit ?? 0) : 0;
  const credit = hasCredit ? Math.abs(parsedCredit ?? 0) : 0;

  return { kind: "ok", amount: credit - debit };
}

function resolveBalanceAfter(raw: Record<string, string>, mapping: CsvMapping): number | null {
  if (!mapping.balanceAfter) {
    return null;
  }

  const value = raw[mapping.balanceAfter];
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = parseStrictMoneyInput(value);
  return parsed === null ? null : parsed;
}

function findExternalId(raw: Record<string, string>): string | undefined {
  const indexed = new Map(Object.entries(raw).map(([key, value]) => [normalizeDescription(key), value]));

  return (
    indexed.get("FITID") ??
    indexed.get("ID") ??
    indexed.get("CODIGO") ??
    indexed.get("CODIGO TRANSACAO") ??
    indexed.get("DOCUMENTO")
  );
}

function incrementReason(reasons: Record<string, number>, reason: CsvRowReason): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

export function analyzeCsvRows(rows: Record<string, string>[], mapping: CsvMapping): CsvMappingAnalysis {
  const mapped: ParsedImportRow[] = [];
  const diagnostics: CsvRowDiagnostic[] = [];
  const reasons: Record<string, number> = {};
  let ignoredRows = 0;
  let errorRows = 0;

  for (const [index, raw] of rows.entries()) {
    const line = index + 1;
    const dateValue = (raw[mapping.date] ?? "").trim();
    const descriptionValue = (raw[mapping.description] ?? "").trim();
    const historyValue = mapping.history ? (raw[mapping.history] ?? "").trim() : "";
    const combinedDescription = [historyValue, descriptionValue].filter(Boolean).join(" ");
    const amountValue = resolveAmountValue(raw, mapping);
    const balanceAfter = resolveBalanceAfter(raw, mapping);

    if (!dateValue) {
      diagnostics.push({
        line,
        status: "ignored",
        reason: "missing_date",
        message: "Linha ignorada: data ausente.",
        raw
      });
      ignoredRows += 1;
      incrementReason(reasons, "missing_date");
      continue;
    }

    if (!descriptionValue && !historyValue) {
      diagnostics.push({
        line,
        status: "ignored",
        reason: "missing_description",
        message: "Linha ignorada: descricao ausente.",
        raw
      });
      ignoredRows += 1;
      incrementReason(reasons, "missing_description");
      continue;
    }

    if (amountValue.kind === "missing") {
      diagnostics.push({
        line,
        status: "ignored",
        reason: "missing_amount",
        message: "Linha ignorada: valor ausente.",
        raw
      });
      ignoredRows += 1;
      incrementReason(reasons, "missing_amount");
      continue;
    }

    if (amountValue.kind === "invalid") {
      diagnostics.push({
        line,
        status: "error",
        reason: "invalid_amount",
        message: "Linha com erro: valor invalido.",
        raw
      });
      errorRows += 1;
      incrementReason(reasons, "invalid_amount");
      continue;
    }

    if (ignoredDescriptionRegex.test(combinedDescription)) {
      diagnostics.push({
        line,
        status: "ignored",
        reason: "ignored_balance_row",
        message: "Linha ignorada: saldo/resumo.",
        raw
      });
      ignoredRows += 1;
      incrementReason(reasons, "ignored_balance_row");
      continue;
    }

    try {
      const draft = normalizeTransaction({
        date: dateValue,
        description: descriptionValue || historyValue || "Sem descricao",
        amount: amountValue.amount,
        type: mapping.type ? raw[mapping.type] : undefined
      });

      if (ignoredDescriptionRegex.test(draft.description) || Math.abs(draft.amount) < 0.01) {
        diagnostics.push({
          line,
          status: "ignored",
          reason: ignoredDescriptionRegex.test(draft.description) ? "ignored_balance_row" : "zero_amount",
          message:
            ignoredDescriptionRegex.test(draft.description)
              ? "Linha ignorada: saldo/resumo."
              : "Linha ignorada: valor zero.",
          raw
        });
        ignoredRows += 1;
        incrementReason(
          reasons,
          ignoredDescriptionRegex.test(draft.description) ? "ignored_balance_row" : "zero_amount"
        );
        continue;
      }

      const accountHint = mapping.account ? raw[mapping.account] : undefined;
      const externalId = findExternalId(raw);

      if (!draft.description || !Number.isFinite(draft.amount)) {
        diagnostics.push({
          line,
          status: "error",
          reason: "invalid_normalized_row",
          message: "Linha com erro: normalizacao invalida.",
          raw
        });
        errorRows += 1;
        incrementReason(reasons, "invalid_normalized_row");
        continue;
      }

      const canonical = toCanonicalImportRow({
        date: draft.date,
        amount: draft.amount,
        type: draft.type,
        balanceAfter,
        sourceType: "csv",
        description: draft.description,
        transactionKindRaw: historyValue || undefined,
        counterpartyRaw: descriptionValue || undefined,
        accountHint,
        externalId,
        raw
      });

      const mappedRow: ParsedImportRow = {
        ...canonical,
        sourceType: "csv",
        documentType: null
      };

      mapped.push(mappedRow);
      diagnostics.push({
        line,
        status: "ok",
        reason: "ok",
        message: "Linha valida para importacao.",
        raw,
        mapped: mappedRow
      });
      incrementReason(reasons, "ok");
    } catch (error) {
      const dateError =
        error instanceof Error &&
        (error.message.toLowerCase().includes("data invalida") || error.message.toLowerCase().includes("invalid date"));

      diagnostics.push({
        line,
        status: "error",
        reason: dateError ? "invalid_date" : "row_parse_error",
        message: dateError ? "Linha com erro: data invalida." : "Linha com erro durante parse.",
        raw
      });
      errorRows += 1;
      incrementReason(reasons, dateError ? "invalid_date" : "row_parse_error");
      continue;
    }
  }

  return {
    rows: mapped,
    diagnostics,
    summary: {
      totalRows: rows.length,
      validRows: mapped.length,
      ignoredRows,
      errorRows,
      reasons
    }
  };
}

export function mapCsvRows(rows: Record<string, string>[], mapping: CsvMapping): ParsedImportRow[] {
  return analyzeCsvRows(rows, mapping).rows;
}
