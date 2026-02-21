import { parseMoneyInput } from "@/lib/money";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";

export type CsvParseResult = {
  columns: string[];
  rows: Record<string, string>[];
  delimiter: string;
  detectedEncoding: "utf8" | "latin1";
};

export type CsvMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
  account?: string;
};

export type ParsedImportRow = {
  date: Date;
  description: string;
  normalizedDescription: string;
  amount: number;
  type: "income" | "expense";
  externalId?: string;
  accountHint?: string;
  raw: Record<string, string>;
};

function decodeBuffer(buffer: Buffer): { text: string; encoding: "utf8" | "latin1" } {
  const utf8 = buffer.toString("utf8");
  const replacementChars = (utf8.match(/�/g) ?? []).length;
  const ratio = replacementChars / Math.max(utf8.length, 1);

  if (ratio > 0.01) {
    return {
      text: buffer.toString("latin1"),
      encoding: "latin1"
    };
  }

  return {
    text: utf8,
    encoding: "utf8"
  };
}

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
  return value.replace(/^"|"$/g, "").trim();
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
  const { text, encoding } = decodeBuffer(buffer);
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

  return {
    date: pickColumn(columns, ["data", "date", "dt", "lancamento", "lançamento", "posted"]),
    description: pickColumn(columns, [
      "descricao",
      "descrição",
      "description",
      "historico",
      "histórico",
      "memo",
      "name",
      "details",
      "narrative"
    ]),
    amount,
    debit,
    credit,
    type: pickColumn(columns, ["tipo", "type", "natureza", "debito_credito", "d/c"]),
    account: pickColumn(columns, ["conta", "account", "bank", "cartao"])
  };
}

function resolveAmountValue(raw: Record<string, string>, mapping: CsvMapping): number | string | null {
  if (mapping.amount) {
    const amountValue = raw[mapping.amount];
    if (amountValue && amountValue.trim().length > 0) {
      return amountValue;
    }
  }

  const debitRaw = mapping.debit ? raw[mapping.debit] ?? "" : "";
  const creditRaw = mapping.credit ? raw[mapping.credit] ?? "" : "";
  const hasDebit = debitRaw.trim().length > 0;
  const hasCredit = creditRaw.trim().length > 0;

  if (!hasDebit && !hasCredit) {
    return null;
  }

  const debit = hasDebit ? Math.abs(parseMoneyInput(debitRaw)) : 0;
  const credit = hasCredit ? Math.abs(parseMoneyInput(creditRaw)) : 0;

  return credit - debit;
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

export function mapCsvRows(rows: Record<string, string>[], mapping: CsvMapping): ParsedImportRow[] {
  const mapped: ParsedImportRow[] = [];

  for (const raw of rows) {
    try {
      const dateValue = raw[mapping.date];
      const descriptionValue = (raw[mapping.description] ?? "Sem descricao").trim();
      const amountValue = resolveAmountValue(raw, mapping);

      if (!dateValue || amountValue === null) {
        continue;
      }

      if (ignoredDescriptionRegex.test(descriptionValue)) {
        continue;
      }

      const draft = normalizeTransaction({
        date: dateValue,
        description: descriptionValue,
        amount: amountValue,
        type: mapping.type ? raw[mapping.type] : undefined
      });

      if (ignoredDescriptionRegex.test(draft.description) || Math.abs(draft.amount) < 0.01) {
        continue;
      }

      const accountHint = mapping.account ? raw[mapping.account] : undefined;
      const externalId = findExternalId(raw);

      if (!draft.description || !Number.isFinite(draft.amount)) {
        continue;
      }

      mapped.push({
        ...draft,
        accountHint,
        externalId,
        raw
      });
    } catch {
      continue;
    }
  }

  return mapped;
}
