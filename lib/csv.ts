import { parseStrictMoneyInput } from "@/lib/money";
import { normalizeDescription, normalizeTransaction } from "@/lib/normalize";
import { type ImportTextEncoding, decodeImportText, fixCommonMojibake } from "@/lib/import-text";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { inferSignedAmountsFromBalanceAnchors } from "@/lib/finance/balance-sign-inference";

export type CsvParseMetadata = {
  accountHint?: string | null;
  accountIdentifier?: string | null;
  accountLabel?: string | null;
  institutionHint?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
};

export type CsvParseResult = {
  columns: string[];
  rows: Record<string, string>[];
  delimiter: string;
  detectedEncoding: ImportTextEncoding;
  metadata: CsvParseMetadata;
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
  "RELEASE_DATE",
  "POSTING_DATE",
  "LANC",
  "POSTED",
  "DESCR",
  "HIST",
  "TRANSACTION",
  "REFERENCE",
  "MEMO",
  "DETAIL",
  "VALOR",
  "AMOUNT",
  "NET_AMOUNT",
  "DEBIT",
  "CREDIT",
  "PARTIAL_BALANCE",
  "FINAL_BALANCE",
  "CONTA",
  "ACCOUNT",
  "TIPO"
];

const ignoredDescriptionRegex =
  /\b(SALDO(?:\s+ANTERIOR|\s+FINAL|\s+DISPON[IÍ]VEL|\s+DO\s+DIA)?|TOTAL(?:\s+DO\s+DIA)?|RESUMO)\b/i;
const CSV_INSTITUTION_HINTS: Array<{ institution: string; patterns: string[] }> = [
  {
    institution: "Mercado Pago",
    patterns: ["MERCADO PAGO", "MERCADOPAGO", "MELI", "DINHEIRO RESERVADO", "MUSD"]
  },
  {
    institution: "Inter",
    patterns: ["BANCO INTER", "CARTAO INTER", "FATURA CARTAO INTER", "INTER "]
  },
  {
    institution: "Nubank",
    patterns: ["NUBANK", "NU PAGAMENTOS"]
  },
  {
    institution: "PagBank",
    patterns: ["PAGBANK", "PAGSEGURO"]
  }
];

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

  const headerIntentScore = (row: string[]): number => {
    const normalizedCells = row.map((cell) => normalizeDescription(cell));
    const hasDateField = normalizedCells.some(
      (cell) => cell.includes("DATE") || cell.includes("DATA") || cell.includes("LANC")
    );
    const hasAmountField = normalizedCells.some(
      (cell) =>
        cell.includes("VALOR") ||
        cell.includes("AMOUNT") ||
        cell.includes("DEBIT") ||
        cell.includes("CREDIT")
    );
    const hasDescriptionField = normalizedCells.some(
      (cell) =>
        cell.includes("DESCR") ||
        cell.includes("HIST") ||
        cell.includes("TRANSACTION") ||
        cell.includes("BENEF")
    );
    const mostlyBalanceSummary =
      normalizedCells.length > 0 &&
      normalizedCells.every(
        (cell) =>
          cell.includes("BALANCE") ||
          cell.includes("SALDO") ||
          cell.includes("DEBIT") ||
          cell.includes("CREDIT")
      );

    let score = 0;
    if (hasDateField) score += 4;
    if (hasAmountField) score += 3;
    if (hasDescriptionField) score += 3;
    if (mostlyBalanceSummary && !hasDateField) score -= 4;
    return score;
  };

  inspected.forEach((row, index) => {
    const nonEmpty = row.filter((cell) => sanitizeCell(cell).length > 0).length;
    if (nonEmpty < 2) return;

    const headerHits = row.filter((cell) => looksLikeHeaderCell(cell)).length;
    const hasDataSignature = looksLikeDataRow(row);
    const nextNonEmptyRow = inspected
      .slice(index + 1)
      .find((candidate) => candidate.some((cell) => sanitizeCell(cell).length > 0));
    const nextRowLooksLikeData = nextNonEmptyRow ? looksLikeDataRow(nextNonEmptyRow) : false;

    const score =
      nonEmpty +
      headerHits * 2.5 +
      headerIntentScore(row) +
      (nextRowLooksLikeData ? 6 : 0) -
      (hasDataSignature ? 2 : 0);

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

function humanizeAccountLabel(value: string | null | undefined): string | null {
  const normalized = normalizeDescription(value ?? "");
  if (!normalized) return null;
  if (normalized.includes("CONTA CORRENTE")) return "Conta Corrente";
  if (normalized.includes("CONTA POUPANCA") || normalized.includes("CONTA POUPANÇA")) return "Conta Poupanca";
  if (normalized.includes("CONTA SALARIO") || normalized.includes("CONTA SALÁRIO")) return "Conta Salario";
  if (normalized.includes("CARTAO") || normalized.includes("CARTÃO") || normalized.includes("FATURA")) {
    return "Cartao";
  }
  if (normalized.includes("CARTEIRA")) return "Carteira";
  if (normalized.includes("CONTA")) return "Conta";
  return null;
}

function detectInstitutionHint(text: string): string | null {
  const normalized = normalizeDescription(text);
  if (!normalized) return null;

  for (const rule of CSV_INSTITUTION_HINTS) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule.institution;
    }
  }

  return null;
}

const openingBalanceAliases = [
  "INITIAL_BALANCE",
  "INITIAL BALANCE",
  "OPENING_BALANCE",
  "OPENING BALANCE",
  "SALDO INICIAL",
  "SALDO ANTERIOR"
];

const closingBalanceAliases = [
  "FINAL_BALANCE",
  "FINAL BALANCE",
  "CLOSING_BALANCE",
  "CLOSING BALANCE",
  "SALDO FINAL",
  "SALDO ATUAL"
];

function normalizeBalanceLabel(value: string): string {
  return normalizeDescription(value).replace(/[_-]+/g, " ");
}

function matchesBalanceLabel(value: string, aliases: string[]): boolean {
  const normalized = normalizeBalanceLabel(value);
  if (!normalized) return false;

  return aliases
    .map((alias) => normalizeBalanceLabel(alias))
    .some((alias) => normalized === alias || normalized.includes(alias));
}

function parseMetadataMoneyValue(value: string | null | undefined): number | null {
  const input = sanitizeCell(value ?? "");
  if (!input || !/\d/.test(input)) {
    return null;
  }

  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(input) || /\b\d{4}-\d{2}-\d{2}\b/.test(input)) {
    return null;
  }

  const parsed = parseStrictMoneyInput(input);
  return parsed === null ? null : parsed;
}

function findBalanceValueInCells(cells: string[], startIndex: number): number | null {
  for (let index = startIndex; index < cells.length; index += 1) {
    const parsed = parseMetadataMoneyValue(cells[index]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function extractBalanceMetadataValue(preludeRows: string[][], aliases: string[]): number | null {
  for (let rowIndex = 0; rowIndex < preludeRows.length; rowIndex += 1) {
    const row = preludeRows[rowIndex];

    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      if (!matchesBalanceLabel(row[cellIndex] ?? "", aliases)) {
        continue;
      }

      const sameRowValue = findBalanceValueInCells(row, cellIndex + 1);
      if (sameRowValue !== null) {
        return sameRowValue;
      }

      const nextRow = preludeRows[rowIndex + 1] ?? [];
      const alignedValue = parseMetadataMoneyValue(nextRow[cellIndex]);
      if (alignedValue !== null) {
        return alignedValue;
      }
    }
  }

  return null;
}

function extractCsvMetadata(matrix: string[][], headerIndex: number): CsvParseMetadata {
  const preludeRows = matrix
    .slice(0, Math.max(0, headerIndex))
    .map((row) => row.map((cell) => sanitizeCell(cell)).filter((cell) => cell.length > 0))
    .filter((row) => row.length > 0);

  const dataSampleRows = matrix
    .slice(headerIndex + 1, headerIndex + 16)
    .map((row) => row.map((cell) => sanitizeCell(cell)).filter((cell) => cell.length > 0))
    .filter((row) => row.length > 0);

  const combinedPrelude = preludeRows.map((row) => row.join(" ")).join("\n");
  const combinedSample = dataSampleRows.map((row) => row.join(" ")).join("\n");

  let accountIdentifier: string | null = null;
  let accountLabel: string | null = null;

  for (const row of preludeRows) {
    const first = row[0] ?? "";
    const second = row[1] ?? "";
    const rowText = row.join(" ").trim();
    const normalizedFirst = normalizeDescription(first);

    if (!accountIdentifier && normalizedFirst === "CONTA" && second) {
      accountIdentifier = second.trim();
    }

    if (!accountIdentifier) {
      const accountMatch = rowText.match(/\bCONTA\b\s*[:;]?\s*([A-Z0-9.\-\/]+)/i);
      const candidateIdentifier = sanitizeCell(accountMatch?.[1] ?? "");
      if (candidateIdentifier && /\d/.test(candidateIdentifier)) {
        accountIdentifier = candidateIdentifier;
      }
    }

    if (!accountLabel) {
      accountLabel = humanizeAccountLabel(rowText);
    }
  }

  const institutionHint = detectInstitutionHint(`${combinedPrelude}\n${combinedSample}`);
  const fallbackLabel = humanizeAccountLabel(combinedPrelude);
  const resolvedAccountLabel = accountLabel ?? fallbackLabel ?? null;
  const openingBalance = extractBalanceMetadataValue(preludeRows, openingBalanceAliases);
  const closingBalance = extractBalanceMetadataValue(preludeRows, closingBalanceAliases);

  let accountHint: string | null = null;
  if (resolvedAccountLabel && institutionHint && accountIdentifier) {
    accountHint = `${resolvedAccountLabel} ${institutionHint} ${accountIdentifier}`.trim();
  } else if (resolvedAccountLabel && accountIdentifier) {
    accountHint = `${resolvedAccountLabel} ${accountIdentifier}`.trim();
  } else if (institutionHint && accountIdentifier) {
    accountHint = `Conta ${institutionHint} ${accountIdentifier}`.trim();
  } else if (accountIdentifier) {
    accountHint = accountIdentifier;
  } else if (resolvedAccountLabel && institutionHint) {
    accountHint = `${resolvedAccountLabel} ${institutionHint}`.trim();
  } else if (institutionHint) {
    accountHint = `Conta ${institutionHint}`.trim();
  }

  return {
    accountHint,
    accountIdentifier,
    accountLabel: resolvedAccountLabel,
    institutionHint,
    openingBalance,
    closingBalance
  };
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
      detectedEncoding: encoding,
      metadata: {}
    };
  }

  const headerIndex = findHeaderIndex(matrix);
  const columns = buildColumns(matrix[headerIndex] ?? matrix[0] ?? []);
  const metadata = extractCsvMetadata(matrix, headerIndex);

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
    detectedEncoding: encoding,
    metadata
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
  const history = pickColumn(columns, [
    "historico",
    "histórico",
    "history",
    "tipo lancamento",
    "tipo transacao",
    "transaction type",
    "transaction_type"
  ], [
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
      "narrative",
      "transaction type",
      "transaction_type"
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
  const aliases = [
    "FITID",
    "REFERENCE_ID",
    "REFERENCE ID",
    "ID DA OPERACAO",
    "ID OPERACAO",
    "TRANSACTION ID",
    "TRANSACTION_ID",
    "ID",
    "CODIGO",
    "CODIGO TRANSACAO",
    "DOCUMENTO"
  ];

  for (const alias of aliases) {
    const value = indexed.get(alias);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function incrementReason(reasons: Record<string, number>, reason: CsvRowReason): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

export function analyzeCsvRows(
  rows: Record<string, string>[],
  mapping: CsvMapping,
  options: { openingBalance?: number | null } = {}
): CsvMappingAnalysis {
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
        message: "Linha com erro: valor inválido.",
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

  const inferred = inferSignedAmountsFromBalanceAnchors(mapped, {
    openingBalance: options.openingBalance
  });
  const mappedByOriginal = new Map(mapped.map((row, index) => [row, inferred.rows[index]] as const));

  for (const diagnostic of diagnostics) {
    if (diagnostic.mapped) {
      diagnostic.mapped = mappedByOriginal.get(diagnostic.mapped) ?? diagnostic.mapped;
    }
  }

  return {
    rows: inferred.rows,
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

