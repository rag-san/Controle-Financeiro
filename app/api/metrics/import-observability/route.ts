import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { withRouteProfiling } from "@/lib/profiling";
import { importObservabilityRepo } from "@/lib/server/import-observability.repo";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  minEvents: z.coerce.number().int().min(1).max(1000).optional(),
  errorRateThreshold: z.coerce.number().min(0).max(1).optional(),
  duplicateRateThreshold: z.coerce.number().min(0).max(100).optional(),
  parserUnavailableThreshold: z.coerce.number().int().min(1).max(1000).optional(),
  cardPaymentNotConvertedThreshold: z.coerce.number().int().min(1).max(1000).optional()
});

type SourcePhaseSummary = {
  sourceType: string;
  phase: "parse" | "mapping" | "commit";
  events: number;
  success: number;
  errors: number;
  duplicates: number;
  transferCreated: number;
  internalTransferAutoMatched: number;
  cardPaymentsDetected: number;
  cardPaymentsNotConverted: number;
};

type RecentErrorSummary = {
  sourceType: string;
  phase: "parse" | "mapping" | "commit";
  errorCode: string;
  count: number;
  lastSeenAt: string;
};

type ObservabilityAlertSeverity = "warning" | "critical";

type ObservabilityAlert = {
  code:
    | "high_error_rate"
    | "high_duplicates_per_commit"
    | "card_payment_not_converted_spike"
    | "parser_unavailable_spike";
  severity: ObservabilityAlertSeverity;
  sourceType?: string;
  phase?: "parse" | "mapping" | "commit";
  metric: string;
  value: number;
  threshold: number;
  message: string;
};

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function roundMetric(value: number, precision = 3): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function pickSeverity(input: { value: number; threshold: number; criticalFactor?: number }): ObservabilityAlertSeverity {
  const criticalFactor = input.criticalFactor ?? 2;
  return input.value >= input.threshold * criticalFactor ? "critical" : "warning";
}

function buildAlerts(input: {
  bySourcePhase: SourcePhaseSummary[];
  recentErrors: RecentErrorSummary[];
  thresholds: {
    minEvents: number;
    errorRateThreshold: number;
    duplicateRateThreshold: number;
    parserUnavailableThreshold: number;
    cardPaymentNotConvertedThreshold: number;
  };
}): ObservabilityAlert[] {
  const alerts: ObservabilityAlert[] = [];

  for (const row of input.bySourcePhase) {
    if (row.events < input.thresholds.minEvents) {
      continue;
    }

    const errorRate = ratio(row.errors, row.events);
    if (errorRate >= input.thresholds.errorRateThreshold) {
      alerts.push({
        code: "high_error_rate",
        severity: pickSeverity({
          value: errorRate,
          threshold: input.thresholds.errorRateThreshold,
          criticalFactor: 1.8
        }),
        sourceType: row.sourceType,
        phase: row.phase,
        metric: "error_rate",
        value: roundMetric(errorRate),
        threshold: input.thresholds.errorRateThreshold,
        message: `Taxa de erro elevada em ${row.sourceType}/${row.phase}.`
      });
    }

    if (row.phase !== "commit") {
      continue;
    }

    const duplicatesPerCommit = ratio(row.duplicates, row.events);
    if (duplicatesPerCommit >= input.thresholds.duplicateRateThreshold) {
      alerts.push({
        code: "high_duplicates_per_commit",
        severity: pickSeverity({
          value: duplicatesPerCommit,
          threshold: input.thresholds.duplicateRateThreshold,
          criticalFactor: 2
        }),
        sourceType: row.sourceType,
        phase: row.phase,
        metric: "duplicates_per_commit",
        value: roundMetric(duplicatesPerCommit),
        threshold: input.thresholds.duplicateRateThreshold,
        message: `Volume de duplicatas por commit acima do esperado em ${row.sourceType}.`
      });
    }

    if (row.cardPaymentsNotConverted >= input.thresholds.cardPaymentNotConvertedThreshold) {
      alerts.push({
        code: "card_payment_not_converted_spike",
        severity: pickSeverity({
          value: row.cardPaymentsNotConverted,
          threshold: input.thresholds.cardPaymentNotConvertedThreshold,
          criticalFactor: 2
        }),
        sourceType: row.sourceType,
        phase: row.phase,
        metric: "card_payment_not_converted",
        value: row.cardPaymentsNotConverted,
        threshold: input.thresholds.cardPaymentNotConvertedThreshold,
        message: "Pagamentos de fatura sem conversao para transferencia acima do limite."
      });
    }
  }

  const parserUnavailableTotal = input.recentErrors
    .filter((item) =>
      ["source_parser_unavailable", "pdf_unsupported_issuer_profile", "pdf_no_transactions"].includes(item.errorCode)
    )
    .reduce((sum, item) => sum + item.count, 0);

  if (parserUnavailableTotal >= input.thresholds.parserUnavailableThreshold) {
    alerts.push({
      code: "parser_unavailable_spike",
      severity: pickSeverity({
        value: parserUnavailableTotal,
        threshold: input.thresholds.parserUnavailableThreshold,
        criticalFactor: 2
      }),
      metric: "parser_unavailable_total",
      value: parserUnavailableTotal,
      threshold: input.thresholds.parserUnavailableThreshold,
      message: "Erros de parser acima do limite no período analisado."
    });
  }

  return alerts.sort((left, right) => {
    const severityWeight = (value: ObservabilityAlertSeverity) => (value === "critical" ? 2 : 1);
    const severityDiff = severityWeight(right.severity) - severityWeight(left.severity);
    if (severityDiff !== 0) return severityDiff;
    return right.value - left.value;
  });
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/metrics/import-observability.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const from = parseDate(parsed.data.from);
    const to = parseDate(parsed.data.to);
    if (parsed.data.from && !from) {
      return NextResponse.json({ error: "Parâmetro from inválido." }, { status: 400 });
    }
    if (parsed.data.to && !to) {
      return NextResponse.json({ error: "Parâmetro to inválido." }, { status: 400 });
    }
    if (from && to && from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "Parâmetro from deve ser menor ou igual a to." }, { status: 400 });
    }

    const bySourcePhase = await importObservabilityRepo.summarizeBySource({
      userId: auth.userId,
      from: from ?? undefined,
      to: to ?? undefined
    }) as SourcePhaseSummary[];
    const recentErrors = await importObservabilityRepo.recentErrors({
      userId: auth.userId,
      from: from ?? undefined,
      to: to ?? undefined,
      limit: parsed.data.limit
    }) as RecentErrorSummary[];

    const thresholds = {
      minEvents: parsed.data.minEvents ?? 8,
      errorRateThreshold: parsed.data.errorRateThreshold ?? 0.2,
      duplicateRateThreshold: parsed.data.duplicateRateThreshold ?? 0.25,
      parserUnavailableThreshold: parsed.data.parserUnavailableThreshold ?? 3,
      cardPaymentNotConvertedThreshold: parsed.data.cardPaymentNotConvertedThreshold ?? 2
    };

    const alerts = buildAlerts({
      bySourcePhase,
      recentErrors,
      thresholds
    });

    return NextResponse.json({
      view: "import-observability",
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null
      },
      thresholds,
      alerts,
      bySourcePhase,
      recentErrors
    });
  });
}

