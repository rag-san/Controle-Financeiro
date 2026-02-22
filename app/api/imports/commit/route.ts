import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import {
  MAX_IMPORT_COMMIT_ROWS,
  commitImportForUser,
  importCommitPayloadSchema
} from "@/lib/server/imports-commit.service";
import { logImportEvent } from "@/lib/server/import-telemetry";

function commitError(
  status: number,
  code: string,
  error: string,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      error,
      code,
      ...(details ? { details } : {})
    },
    { status }
  );
}

function payloadMetadata(payload: unknown): {
  sourceType?: string;
  fileName?: string;
  rows?: number;
} {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const payloadRecord = payload as Record<string, unknown>;
  const sourceType = "sourceType" in payloadRecord ? String(payloadRecord.sourceType ?? "") : undefined;
  const fileName = "fileName" in payloadRecord ? String(payloadRecord.fileName ?? "") : undefined;
  const rows = Array.isArray(payloadRecord.rows) ? payloadRecord.rows.length : undefined;

  return {
    sourceType: sourceType || undefined,
    fileName: fileName || undefined,
    rows
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/imports/commit.POST", async () => {
    let metadata: ReturnType<typeof payloadMetadata> = {};
    let currentUserId = "unknown";

    try {
      const auth = await requireUser(request);
      if (auth instanceof NextResponse) return auth;
      currentUserId = auth.userId;

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return commitError(400, "invalid_json", "Payload JSON invalido.");
      }

      metadata = payloadMetadata(payload);

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return commitError(400, "invalid_payload", "Payload de importacao invalido.");
      }

      const payloadRecord = payload as Record<string, unknown>;
      const payloadRows = payloadRecord.rows;

      if (Array.isArray(payloadRows) && payloadRows.length > MAX_IMPORT_COMMIT_ROWS) {
        return commitError(
          400,
          "rows_limit_exceeded",
          `O payload excede o limite de ${MAX_IMPORT_COMMIT_ROWS} linhas por importacao.`,
          {
            maxRows: MAX_IMPORT_COMMIT_ROWS,
            receivedRows: payloadRows.length
          }
        );
      }

      const parsed = importCommitPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        return commitError(400, "invalid_payload", "Payload de importacao invalido.", {
          issues: parsed.error.flatten()
        });
      }

      const result = await commitImportForUser(auth.userId, parsed.data);

      invalidateFinanceCaches(auth.userId);
      logImportEvent("import.commit", {
        userId: auth.userId,
        sourceType: parsed.data.sourceType,
        fileName: parsed.data.fileName,
        totalRows: result.totalReceived,
        validRows: result.totalImported,
        imported: result.totalImported,
        skipped: result.totalSkipped,
        duplicates: result.duplicates,
        invalidRows: result.invalidRows
      });

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      logImportEvent("import.commit", {
        userId: currentUserId,
        sourceType: "unknown",
        fileName: "unknown",
        phase: "commit",
        errorCode: "import_commit_failed"
      });

      const message = error instanceof Error ? error.message : "Falha ao concluir importacao";
      return commitError(500, "import_commit_failed", message, {
        sourceType: metadata.sourceType,
        fileName: metadata.fileName,
        receivedRows: metadata.rows
      });
    }
  });
}


