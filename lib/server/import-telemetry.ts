import crypto from "crypto";

type ImportEvent = "import.parse" | "import.mapping" | "import.commit";
type ImportPhase = "parse" | "mapping" | "commit";

type ImportTelemetryInput = {
  userId: string;
  sourceType?: string;
  fileName?: string;
  phase?: ImportPhase;
  totalRows?: number;
  validRows?: number;
  ignoredRows?: number;
  errorRows?: number;
  imported?: number;
  skipped?: number;
  duplicates?: number;
  invalidRows?: number;
  errorCode?: string;
};

function anonymizeUserId(userId: string): string {
  if (!userId || userId === "unknown") {
    return "unknown";
  }

  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

function safeCounter(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

export function logImportEvent(event: ImportEvent, input: ImportTelemetryInput): void {
  const payload = {
    event,
    phase: input.phase ?? event.split(".")[1] ?? "unknown",
    userIdHash: anonymizeUserId(input.userId),
    sourceType: input.sourceType ?? "unknown",
    fileName: input.fileName ?? "unknown",
    totalRows: safeCounter(input.totalRows),
    validRows: safeCounter(input.validRows),
    ignoredRows: safeCounter(input.ignoredRows),
    errorRows: safeCounter(input.errorRows),
    imported: safeCounter(input.imported),
    skipped: safeCounter(input.skipped),
    duplicates: safeCounter(input.duplicates),
    invalidRows: safeCounter(input.invalidRows),
    errorCode: input.errorCode
  };

  console.info(`[IMPORT] ${JSON.stringify(payload)}`);
}
