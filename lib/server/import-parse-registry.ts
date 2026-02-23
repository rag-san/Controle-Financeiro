export type ImportSourceType = "csv" | "ofx" | "pdf";

export const PARSERS = {
  csv: true,
  ofx: true,
  pdf: true
} as const;

export type SupportedImportSourceType = keyof typeof PARSERS;

export const SUPPORTED_IMPORT_SOURCE_TYPES = Object.keys(PARSERS) as SupportedImportSourceType[];

export type StructuredApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function isSupportedImportSourceType(
  sourceType: string
): sourceType is SupportedImportSourceType {
  return Object.hasOwn(PARSERS, sourceType);
}

export function buildSourceParserUnavailableError(sourceType: string): {
  status: 422;
  error: StructuredApiError;
} {
  return {
    status: 422,
    error: {
      code: "source_parser_unavailable",
      message: `Parser not available for sourceType=${sourceType}`,
      details: {
        sourceType,
        supported: SUPPORTED_IMPORT_SOURCE_TYPES
      }
    }
  };
}
