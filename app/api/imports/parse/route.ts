import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import {
  analyzeCsvRows,
  parseCsvBuffer,
  suggestCsvMapping,
  type CsvMapping,
  type CsvParseMetadata,
  type CsvRowDiagnostic
} from "@/lib/csv";
import { toCanonicalImportRow } from "@/lib/import-canonical";
import { parseOfxBuffer } from "@/lib/ofx";
import { PdfImportError, parsePdfImport, SUPPORTED_PDF_ISSUER_PROFILES } from "@/lib/pdf";
import { withRouteProfiling } from "@/lib/profiling";
import {
  categorizeCanonicalImportRowWithContext,
  loadImportAutocategorizationContext,
  type ImportAutocategorizationContext
} from "@/lib/server/import-autocategorization.service";
import { logImportEvent } from "@/lib/server/import-telemetry";
import {
  buildSourceParserUnavailableError,
  isSupportedImportSourceType,
  type ImportSourceType,
  type SupportedImportSourceType
} from "@/lib/server/import-parse-registry";

const mappingSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  history: z.string().optional(),
  amount: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  type: z.string().optional(),
  account: z.string().optional(),
  balanceAfter: z.string().optional()
}).refine((value) => Boolean(value.amount || value.debit || value.credit), {
  message: "Selecione Valor ou Debito/Credito no mapeamento"
});

const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;
const PDF_PARSE_TIMEOUT_MS = 12_000;
const PARSE_ERROR_LOG_WINDOW_MS = 15_000;
const recentParseErrorLogs = new Map<string, number>();

type SourceType = ImportSourceType;
type ConfidenceLevel = "alta" | "media" | "baixa";

function inferSourceType(filename: string, content: string): SourceType {
  const lowered = filename.toLowerCase();
  if (lowered.endsWith(".pdf") || content.includes("%PDF")) {
    return "pdf";
  }
  if (lowered.endsWith(".ofx") || content.includes("<OFX")) {
    return "ofx";
  }
  return "csv";
}

function parseError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  const payload: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } = {
    code,
    message
  };

  if (details) {
    payload.details = details;
  }

  return NextResponse.json(
    payload,
    { status }
  );
}

function shouldLogParseError(userId: string, sourceType: SourceType, fileName: string, errorCode: string): boolean {
  const now = Date.now();
  const key = `${userId}:${sourceType}:${fileName}:${errorCode}`;

  for (const [entryKey, timestamp] of recentParseErrorLogs.entries()) {
    if (now - timestamp > PARSE_ERROR_LOG_WINDOW_MS) {
      recentParseErrorLogs.delete(entryKey);
    }
  }

  const previous = recentParseErrorLogs.get(key);
  if (previous && now - previous <= PARSE_ERROR_LOG_WINDOW_MS) {
    return false;
  }

  recentParseErrorLogs.set(key, now);
  return true;
}

function logParseErrorOnce(
  context: { userId: string; sourceType: SourceType; fileName: string },
  errorCode: string
): void {
  if (!shouldLogParseError(context.userId, context.sourceType, context.fileName, errorCode)) {
    return;
  }

  logImportEvent("import.parse", {
    ...context,
    totalRows: 0,
    validRows: 0,
    ignoredRows: 0,
    errorRows: 1,
    phase: "parse",
    errorCode
  });
}

function validateMappingColumns(mapping: CsvMapping, columns: string[]): string[] {
  const available = new Set(columns);
  const requested = [
    mapping.date,
    mapping.description,
    mapping.history,
    mapping.amount,
    mapping.debit,
    mapping.credit,
    mapping.type,
    mapping.account,
    mapping.balanceAfter
  ]
    .filter(Boolean) as string[];

  const missing = requested.filter((column) => !available.has(column));
  return [...new Set(missing)];
}

function mappingConfidence(mapping: Partial<CsvMapping>): {
  overall: ConfidenceLevel;
  missingRequired: Array<"date" | "description" | "amount">;
  fields: {
    date: ConfidenceLevel;
    description: ConfidenceLevel;
    amount: ConfidenceLevel;
  };
} {
  const hasDate = Boolean(mapping.date);
  const hasDescription = Boolean(mapping.description);
  const hasAmount = Boolean(mapping.amount || mapping.debit || mapping.credit);

  const missingRequired: Array<"date" | "description" | "amount"> = [];
  if (!hasDate) missingRequired.push("date");
  if (!hasDescription) missingRequired.push("description");
  if (!hasAmount) missingRequired.push("amount");

  const overall: ConfidenceLevel =
    missingRequired.length === 0 ? "alta" : missingRequired.length === 1 ? "media" : "baixa";

  return {
    overall,
    missingRequired,
    fields: {
      date: hasDate ? "alta" : "baixa",
      description: hasDescription ? "alta" : "baixa",
      amount: hasAmount ? "alta" : "baixa"
    }
  };
}

type PreviewRow = {
  line: number;
  commitIndex: number | null;
  status: "ok" | "ignored" | "error";
  reasonCode: string;
  reason: string;
  date: string | null;
  description: string;
  transactionKind: string;
  counterparty: string;
  merchantKey: string;
  amount: number | null;
  type: "income" | "expense" | "transfer" | null;
  accountHint?: string;
};

type ParsedImportPreviewRow = {
  date: Date;
  description: string;
  amount: number;
  type?: "income" | "expense" | "transfer";
  balanceAfter?: number | null;
  transactionKindRaw?: string;
  counterpartyRaw?: string;
  transactionKindNorm?: string;
  counterpartyNorm?: string;
  merchantKey?: string;
  sourceType?: "csv" | "ofx" | "pdf" | "manual";
  documentType?: string | null;
  externalId?: string;
  accountHint?: string;
  accountId?: string;
  categoryId?: string | null;
  transferToAccountId?: string;
  transferFromAccountId?: string;
  raw?: Record<string, unknown>;
};

type AutocategorizedParsedRow = {
  categoryId?: string | null;
  categorySource?: string | null;
  categoryConfidence?: "high" | "medium" | "low" | "none" | null;
  categoryReason?: string | null;
  categoryNeedsReview?: boolean;
};

type ImportAccountMetadata = {
  accountHint?: string | null;
  accountIdentifier?: string | null;
  accountLabel?: string | null;
  institutionHint?: string | null;
  issuerProfile?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  invoicePurchaseTotal?: number | null;
  invoicePaymentTotal?: number | null;
  invoiceTotalDue?: number | null;
  dueDate?: string | null;
};

function institutionHintFromIssuerProfile(issuerProfile: string | null | undefined): string | null {
  const normalized = String(issuerProfile ?? "").trim().toLowerCase();
  if (normalized.startsWith("inter_")) return "Inter";
  if (normalized.startsWith("nubank_")) return "Nubank";
  if (normalized.startsWith("mercado_pago_")) return "Mercado Pago";
  return null;
}

function enrichParsedRowsWithAccountMetadata<T extends ParsedImportPreviewRow>(
  rows: T[],
  metadata: ImportAccountMetadata
): T[] {
  const fallbackAccountHint = metadata.accountHint?.trim() || undefined;

  return rows.map((row) => ({
    ...row,
    accountHint: row.accountHint ?? fallbackAccountHint,
    raw: {
      ...(row.raw ?? {}),
      importAccountHint: fallbackAccountHint ?? null,
      importAccountIdentifier: metadata.accountIdentifier ?? null,
      importAccountLabel: metadata.accountLabel ?? null,
      importInstitutionHint: metadata.institutionHint ?? null,
      issuerProfile: metadata.issuerProfile ?? null,
      importOpeningBalance: metadata.openingBalance ?? null,
      importClosingBalance: metadata.closingBalance ?? null,
      importInvoicePurchaseTotal: metadata.invoicePurchaseTotal ?? null,
      importInvoicePaymentTotal: metadata.invoicePaymentTotal ?? null,
      importInvoiceTotalDue: metadata.invoiceTotalDue ?? null,
      importDueDate: metadata.dueDate ?? null
    }
  }));
}

function applyAutocategorizationToParsedRows<T extends ParsedImportPreviewRow>(
  rows: T[],
  sourceType: "csv" | "ofx" | "pdf",
  context: ImportAutocategorizationContext
): Array<T & AutocategorizedParsedRow> {
  return rows.map((row) => {
    const canonical = toCanonicalImportRow({
      date: row.date,
      amount: row.amount,
      balanceAfter: row.balanceAfter ?? null,
      sourceType: row.sourceType ?? sourceType,
      documentType: row.documentType ?? null,
      transactionKindRaw: row.transactionKindRaw,
      counterpartyRaw: row.counterpartyRaw,
      description: row.description,
      type: row.type,
      externalId: row.externalId,
      accountHint: row.accountHint,
      accountId: row.accountId,
      categoryId: row.categoryId,
      raw: row.raw ?? {}
    });

    const categorization = categorizeCanonicalImportRowWithContext({
      row: canonical,
      accountId: row.accountId,
      context
    });

    return {
      ...row,
      merchantKey: categorization.merchantKey || canonical.merchantKey,
      categoryId: row.categoryId ?? categorization.categoryId,
      categorySource: row.categoryId ? "manual" : categorization.categorySource,
      categoryConfidence: row.categoryId ? "high" : categorization.confidence,
      categoryReason: row.categoryId ? "Categoria informada manualmente." : categorization.reason,
      categoryNeedsReview: row.categoryId ? false : categorization.shouldReview,
      raw: {
        ...(row.raw ?? {}),
        merchantKey: categorization.merchantKey || canonical.merchantKey,
        categorySource: row.categoryId ? "manual" : categorization.categorySource,
        categorizationConfidence: row.categoryId ? "high" : categorization.confidence,
        categorizationReason: row.categoryId ? "Categoria informada manualmente." : categorization.reason,
        categorizationReviewNeeded: row.categoryId ? false : categorization.shouldReview,
        matchedRule: row.categoryId ? null : categorization.matchedRule
      }
    } as T & AutocategorizedParsedRow;
  });
}

function csvDiagnosticsToPreview(
  diagnostics: CsvRowDiagnostic[],
  mapping: CsvMapping
): PreviewRow[] {
  let commitIndex = 0;

  return diagnostics.map((item) => {
    const mappedCommitIndex = item.mapped ? commitIndex : null;
    if (item.mapped) {
      commitIndex += 1;
    }

    return {
      line: item.line,
      commitIndex: mappedCommitIndex,
      status: item.status,
      reasonCode: item.reason,
      reason: item.message,
      date: item.mapped ? item.mapped.date.toISOString() : null,
      description: item.mapped?.description ?? (item.raw[mapping.description] ?? "").trim(),
      transactionKind:
        item.mapped?.transactionKindRaw ??
        (mapping.history ? String(item.raw[mapping.history] ?? "").trim() : ""),
      counterparty:
        item.mapped?.counterpartyRaw ??
        (item.raw[mapping.description] ? String(item.raw[mapping.description]).trim() : ""),
      merchantKey: item.mapped?.merchantKey ?? "transacao",
      amount: item.mapped ? item.mapped.amount : null,
      type: item.mapped ? item.mapped.type : null,
      accountHint: item.mapped?.accountHint ?? (mapping.account ? item.raw[mapping.account] : undefined)
    };
  });
}

function okRowsToPreviewRows(
  rows: Array<{
    date: Date;
    description: string;
    transactionKindRaw?: string;
    counterpartyRaw?: string;
    merchantKey?: string;
    amount: number;
    type: "income" | "expense" | "transfer";
    accountHint?: string;
  }>
): PreviewRow[] {
  return rows.map((row, index) => ({
    line: index + 1,
    commitIndex: index,
    status: "ok",
    reasonCode: "ok",
    reason: "Linha valida para importacao.",
    date: row.date.toISOString(),
    description: row.description,
    transactionKind: row.transactionKindRaw ?? "Transacao",
    counterparty: row.counterpartyRaw ?? row.description,
    merchantKey: row.merchantKey ?? "transacao",
    amount: row.amount,
    type: row.type,
    accountHint: row.accountHint
  }));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/imports/parse.POST", async () => {
    try {
      const auth = await requireUser(request);
      if (auth instanceof NextResponse) return auth;
      let categorizationContextPromise: Promise<ImportAutocategorizationContext> | null = null;
      const getCategorizationContext = (): Promise<ImportAutocategorizationContext> => {
        if (!categorizationContextPromise) {
          categorizationContextPromise = loadImportAutocategorizationContext(auth.userId, {
            applyRules: true
          });
        }
        return categorizationContextPromise;
      };

      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return parseError(400, "invalid_content_type", "Content-Type deve ser multipart/form-data.", {
          received: contentType || null
        });
      }

      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return parseError(400, "file_missing", "Arquivo não enviado.");
      }

      if (!Number.isFinite(file.size) || file.size <= 0) {
        return parseError(400, "file_empty", "Arquivo inválido ou vazio.");
      }

      if (file.size > MAX_IMPORT_FILE_BYTES) {
        return parseError(
          413,
          "file_size_limit_exceeded",
          `Arquivo excede o limite de ${(MAX_IMPORT_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB.`,
          {
            limitBytes: MAX_IMPORT_FILE_BYTES,
            fileSizeBytes: file.size
          }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = buffer.toString("utf8").slice(0, 5000).toUpperCase();
      const sourceType = inferSourceType(file.name, rawText);
      const parseLogContext = {
        userId: auth.userId,
        sourceType,
        fileName: file.name
      };

      if (!isSupportedImportSourceType(sourceType)) {
        const unsupported = buildSourceParserUnavailableError(sourceType);
        logParseErrorOnce(parseLogContext, unsupported.error.code);
        return parseError(
          unsupported.status,
          unsupported.error.code,
          unsupported.error.message,
          unsupported.error.details
        );
      }

      const parserHandlers: Record<SupportedImportSourceType, () => Promise<NextResponse>> = {
        pdf: async () => {
          const rawPdfPassword = formData.get("pdfPassword");
          const pdfPassword = typeof rawPdfPassword === "string" ? rawPdfPassword.trim() : "";

          try {
            const parsedPdf = await withTimeout(
              parsePdfImport(buffer, {
                password: pdfPassword || undefined
              }),
              PDF_PARSE_TIMEOUT_MS,
              "Tempo limite excedido para leitura de PDF."
            );
            const parserAccountMetadata: ImportAccountMetadata = {
              accountHint:
                typeof parsedPdf.metadata.accountHint === "string" ? parsedPdf.metadata.accountHint : null,
              institutionHint: institutionHintFromIssuerProfile(parsedPdf.issuerProfile),
              issuerProfile: parsedPdf.issuerProfile,
              invoicePurchaseTotal:
                typeof parsedPdf.metadata.invoicePurchaseTotal === "number"
                  ? parsedPdf.metadata.invoicePurchaseTotal
                  : null,
              invoicePaymentTotal:
                typeof parsedPdf.metadata.invoicePaymentTotal === "number"
                  ? parsedPdf.metadata.invoicePaymentTotal
                  : null,
              invoiceTotalDue:
                typeof parsedPdf.metadata.invoiceTotalDue === "number"
                  ? parsedPdf.metadata.invoiceTotalDue
                  : null,
              dueDate: typeof parsedPdf.metadata.dueDate === "string" ? parsedPdf.metadata.dueDate : null
            };
            const rowsWithAccountMetadata = enrichParsedRowsWithAccountMetadata(
              parsedPdf.transactions,
              parserAccountMetadata
            );
            const categorizedRows = applyAutocategorizationToParsedRows(
              rowsWithAccountMetadata,
              sourceType,
              await getCategorizationContext()
            );
            const preview = okRowsToPreviewRows(categorizedRows);

            logImportEvent("import.parse", {
              ...parseLogContext,
              totalRows: parsedPdf.transactions.length,
              validRows: parsedPdf.transactions.length,
              ignoredRows: 0,
              errorRows: 0
            });

            return NextResponse.json({
              sourceType,
              documentType: parsedPdf.documentType,
              issuerProfile: parsedPdf.issuerProfile,
              metadata: parsedPdf.metadata,
              needsMapping: false,
              columns: [],
              rows: categorizedRows,
              preview,
              totalRows: categorizedRows.length,
              validRows: categorizedRows.length,
              ignoredRows: 0,
              errorRows: 0,
              reasons: { ok: categorizedRows.length },
              accountHint: parserAccountMetadata.accountHint ?? null
            });
          } catch (error) {
            if (error instanceof PdfImportError) {
              if (error.code === "password_required" || error.code === "password_invalid") {
                const errorCode = error.code === "password_required" ? "pdf_password_required" : "pdf_password_invalid";
                logParseErrorOnce(parseLogContext, errorCode);
                return parseError(400, errorCode, error.message, {
                  sourceType,
                  requiresPassword: true
                });
              }

              if (error.code === "unsupported_issuer_profile") {
                const errorCode = "pdf_unsupported_issuer_profile";
                logParseErrorOnce(parseLogContext, errorCode);
                return parseError(422, errorCode, error.message, {
                  sourceType,
                  technicalReason: error.technicalReason ?? null,
                  supportedIssuerProfiles: SUPPORTED_PDF_ISSUER_PROFILES,
                  ...(error.details ?? {})
                });
              }

              const fallbackCode = error.code === "no_transactions_found" ? "pdf_no_transactions" : "source_parser_unavailable";
              const fallbackMessage =
                error.code === "no_transactions_found"
                  ? error.message
                  : error.message;
              logParseErrorOnce(parseLogContext, fallbackCode);
              return parseError(422, fallbackCode, fallbackMessage, {
                sourceType,
                technicalReason: error.technicalReason ?? null,
                supportedIssuerProfiles: SUPPORTED_PDF_ISSUER_PROFILES
              });
            }

            const technicalReason = error instanceof Error ? error.message : "Falha desconhecida no parser PDF";
            logParseErrorOnce(parseLogContext, "source_parser_unavailable");
            return parseError(
              422,
              "source_parser_unavailable",
              "Não foi possível ler este PDF automaticamente. Suporte atual: Inter (extrato/fatura), Mercado Pago (extrato/fatura) e Nubank (fatura). Se o erro persistir, use CSV/OFX ou envie este layout para suporte.",
              {
                sourceType,
                technicalReason,
                supportedIssuerProfiles: SUPPORTED_PDF_ISSUER_PROFILES
              }
            );
          }
        },
        ofx: async () => {
          try {
            const parsed = parseOfxBuffer(buffer);
            if (parsed.transactions.length === 0) {
              throw new Error("Nenhuma transação OFX encontrada");
            }

            const parserAccountMetadata: ImportAccountMetadata = {
              accountHint: parsed.accountId ?? null
            };
            const rows = enrichParsedRowsWithAccountMetadata(
              parsed.transactions.map((row) => ({
                ...row,
                accountHint: parsed.accountId ?? undefined,
                documentType: parsed.documentType
              })),
              parserAccountMetadata
            );
            const categorizedRows = applyAutocategorizationToParsedRows(
              rows,
              sourceType,
              await getCategorizationContext()
            );
            const preview = okRowsToPreviewRows(categorizedRows);

            logImportEvent("import.parse", {
              ...parseLogContext,
              totalRows: parsed.transactions.length,
              validRows: parsed.transactions.length,
              ignoredRows: 0,
              errorRows: 0
            });

            return NextResponse.json({
              sourceType,
              documentType: parsed.documentType,
              needsMapping: false,
              columns: [],
              rows: categorizedRows,
              preview,
              totalRows: categorizedRows.length,
              validRows: categorizedRows.length,
              ignoredRows: 0,
              errorRows: 0,
              reasons: { ok: categorizedRows.length },
              accountHint: parserAccountMetadata.accountHint ?? null
            });
          } catch (error) {
            const technicalReason = error instanceof Error ? error.message : "Falha desconhecida no parser OFX";
            logParseErrorOnce(parseLogContext, "source_parser_unavailable");
            return parseError(
              422,
              "source_parser_unavailable",
              "Não foi possível ler este OFX automaticamente. Verifique o arquivo e tente novamente.",
              {
                sourceType,
                technicalReason
              }
            );
          }
        },
        csv: async () => {
          const csv = parseCsvBuffer(buffer);
          if (csv.columns.length === 0 && csv.rows.length === 0) {
            return parseError(400, "file_empty", "Arquivo CSV vazio ou sem dados legiveis.");
          }

          const suggestedMapping = suggestCsvMapping(csv.columns);
          const suggestedConfidence = mappingConfidence(suggestedMapping);

          const rawMapping = formData.get("mapping");
          let parsedMapping: z.infer<typeof mappingSchema> | null = null;

          if (rawMapping) {
            try {
              const mappingResult = mappingSchema.safeParse(JSON.parse(String(rawMapping)));
              if (!mappingResult.success) {
                return parseError(400, "invalid_mapping", "Mapping CSV inválido.", {
                  issues: mappingResult.error.flatten()
                });
              }
              parsedMapping = mappingResult.data;
            } catch {
              return parseError(400, "invalid_mapping_json", "Mapping CSV inválido.");
            }
          }

          if (parsedMapping) {
            const missingColumns = validateMappingColumns(parsedMapping as CsvMapping, csv.columns);
            if (missingColumns.length > 0) {
              return parseError(400, "invalid_mapping_columns", "Mapping CSV inválido: colunas ausentes no arquivo.", {
                missingColumns
              });
            }
          }

          const effectiveMapping = parsedMapping
            ? parsedMapping
            : suggestedConfidence.missingRequired.length === 0
              ? (suggestedMapping as CsvMapping)
              : null;

          const needsMapping = !effectiveMapping;
          if (!effectiveMapping) {
            logImportEvent("import.parse", {
              ...parseLogContext,
              totalRows: csv.rows.length,
              validRows: 0,
              ignoredRows: 0,
              errorRows: 0
            });

            return NextResponse.json({
              sourceType,
              columns: csv.columns,
              delimiter: csv.delimiter,
              detectedEncoding: csv.detectedEncoding,
              metadata: csv.metadata,
              suggestedMapping,
              suggestedMappingConfidence: suggestedConfidence,
              appliedMapping: null,
              needsMapping,
              mappingDiagnostics: {
                mappable: false,
                missingRequired: suggestedConfidence.missingRequired,
                message: "Não foi possível mapear automaticamente as colunas obrigatórias."
              },
              totalRows: csv.rows.length,
              validRows: 0,
              ignoredRows: 0,
              errorRows: 0,
              reasons: {},
              rows: [],
              preview: [],
              sampleRows: csv.rows.slice(0, 15),
              accountHint: csv.metadata.accountHint ?? null
            });
          }

          const analyzed = analyzeCsvRows(csv.rows, effectiveMapping, {
            openingBalance: csv.metadata.openingBalance
          });
          const parserAccountMetadata: ImportAccountMetadata = {
            ...(csv.metadata as CsvParseMetadata),
            issuerProfile: null
          };
          const rowsWithAccountMetadata = enrichParsedRowsWithAccountMetadata(
            analyzed.rows,
            parserAccountMetadata
          );
          const categorizedRows = applyAutocategorizationToParsedRows(
            rowsWithAccountMetadata,
            sourceType,
            await getCategorizationContext()
          );
          const categorizedByCommitIndex = new Map(
            categorizedRows.map((row, index) => [index, row] as const)
          );
          const preview = csvDiagnosticsToPreview(analyzed.diagnostics, effectiveMapping).map((row) => {
            const categorizedRow =
              row.commitIndex !== null ? categorizedByCommitIndex.get(row.commitIndex) : undefined;

            return {
              ...row,
              accountHint: categorizedRow?.accountHint ?? row.accountHint ?? parserAccountMetadata.accountHint ?? undefined,
              merchantKey: categorizedRow?.merchantKey ?? row.merchantKey,
              categoryId: categorizedRow?.categoryId ?? null,
              categoryConfidence: categorizedRow?.categoryConfidence ?? null,
              categoryNeedsReview: categorizedRow?.categoryNeedsReview ?? false
            };
          });

          logImportEvent("import.parse", {
            ...parseLogContext,
            totalRows: analyzed.summary.totalRows,
            validRows: analyzed.summary.validRows,
            ignoredRows: analyzed.summary.ignoredRows,
            errorRows: analyzed.summary.errorRows
          });

          return NextResponse.json({
            sourceType,
            columns: csv.columns,
            delimiter: csv.delimiter,
            detectedEncoding: csv.detectedEncoding,
            metadata: csv.metadata,
            suggestedMapping,
            suggestedMappingConfidence: suggestedConfidence,
            appliedMapping: effectiveMapping,
            needsMapping,
            totalRows: analyzed.summary.totalRows,
            validRows: analyzed.summary.validRows,
            ignoredRows: analyzed.summary.ignoredRows,
            errorRows: analyzed.summary.errorRows,
            reasons: analyzed.summary.reasons,
            rows: categorizedRows,
            preview,
            sampleRows: undefined,
            accountHint: parserAccountMetadata.accountHint ?? null
          });
        }
      };

      return parserHandlers[sourceType]();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar importacao";
      return parseError(500, "import_parse_failed", message);
    }
  });
}

