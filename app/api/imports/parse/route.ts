import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { mapCsvRows, parseCsvBuffer, suggestCsvMapping, type CsvMapping } from "@/lib/csv";
import { parseOfxBuffer } from "@/lib/ofx";
import { parsePdfBuffer } from "@/lib/pdf";
import { withRouteProfiling } from "@/lib/profiling";

const mappingSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  type: z.string().optional(),
  account: z.string().optional()
}).refine((value) => Boolean(value.amount || value.debit || value.credit), {
  message: "Selecione Valor ou Debito/Credito no mapeamento"
});

const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;

function inferSourceType(filename: string, content: string): "csv" | "ofx" | "pdf" {
  const lowered = filename.toLowerCase();
  if (lowered.endsWith(".pdf") || content.includes("%PDF")) {
    return "pdf";
  }
  if (lowered.endsWith(".ofx") || content.includes("<OFX")) {
    return "ofx";
  }
  return "csv";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/imports/parse.POST", async () => {
    try {
      const auth = await requireUser(request);
      if (auth instanceof NextResponse) return auth;

      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Arquivo nao enviado" }, { status: 400 });
      }

      if (!Number.isFinite(file.size) || file.size <= 0) {
        return NextResponse.json({ error: "Arquivo invalido ou vazio" }, { status: 400 });
      }

      if (file.size > MAX_IMPORT_FILE_BYTES) {
        return NextResponse.json(
          {
            error: `Arquivo excede o limite de ${(MAX_IMPORT_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB`
          },
          { status: 413 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = buffer.toString("utf8").slice(0, 5000).toUpperCase();
      const sourceType = inferSourceType(file.name, rawText);

      if (sourceType === "pdf") {
        try {
          const parsedRows = await parsePdfBuffer(buffer);
          return NextResponse.json({
            sourceType,
            needsMapping: false,
            columns: [],
            rows: parsedRows,
            preview: parsedRows.slice(0, 50),
            totalRows: parsedRows.length
          });
        } catch (error) {
          return NextResponse.json(
            {
              sourceType,
              supported: false,
              phase: 2,
              message: error instanceof Error ? error.message : "Parser de PDF indisponivel",
              needsMapping: false,
              rows: [],
              preview: [],
              totalRows: 0
            },
            { status: 422 }
          );
        }
      }

      if (sourceType === "ofx") {
        const parsed = parseOfxBuffer(buffer);

        return NextResponse.json({
          sourceType,
          needsMapping: false,
          columns: [],
          rows: parsed.transactions,
          preview: parsed.transactions.slice(0, 50),
          totalRows: parsed.transactions.length,
          accountHint: parsed.accountId ?? null
        });
      }

      const csv = parseCsvBuffer(buffer);
      const suggestedMapping = suggestCsvMapping(csv.columns);

      const rawMapping = formData.get("mapping");
      let parsedMapping: z.infer<typeof mappingSchema> | null = null;

      if (rawMapping) {
        try {
          const mappingResult = mappingSchema.safeParse(JSON.parse(String(rawMapping)));
          if (!mappingResult.success) {
            return NextResponse.json({ error: "Mapping CSV invalido" }, { status: 400 });
          }
          parsedMapping = mappingResult.data;
        } catch {
          return NextResponse.json({ error: "Mapping CSV invalido" }, { status: 400 });
        }
      }

      const effectiveMapping = parsedMapping
        ? parsedMapping
        : suggestedMapping.date &&
            suggestedMapping.description &&
            (suggestedMapping.amount || suggestedMapping.debit || suggestedMapping.credit)
          ? (suggestedMapping as CsvMapping)
          : null;

      const needsMapping = !effectiveMapping;
      const mappedRows = effectiveMapping ? mapCsvRows(csv.rows, effectiveMapping) : [];

      const preview = mappedRows.slice(0, 50);

      return NextResponse.json({
        sourceType,
        columns: csv.columns,
        delimiter: csv.delimiter,
        detectedEncoding: csv.detectedEncoding,
        suggestedMapping,
        appliedMapping: effectiveMapping,
        needsMapping,
        totalRows: csv.rows.length,
        validRows: mappedRows.length,
        rows: mappedRows,
        preview,
        sampleRows: needsMapping ? csv.rows.slice(0, 15) : undefined
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Falha ao processar importacao"
        },
        { status: 500 }
      );
    }
  });
}
