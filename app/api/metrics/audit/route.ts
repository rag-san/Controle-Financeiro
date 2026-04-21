import { endOfMonth, format, startOfMonth } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { LedgerCoverageError } from "@/lib/server/analytics-source";
import { withRouteProfiling } from "@/lib/profiling";
import { loadNormalizedTransactionsForScope } from "@/lib/server/financial-metrics.service";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["json", "csv"]).optional().default("json")
});

type AuditCheck = {
  key: string;
  expected: number;
  actual: number;
  difference: number;
  status: "ok" | "mismatch";
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function buildCheck(input: { key: string; expected: number; actual: number }): AuditCheck {
  const difference = round2(input.actual - input.expected);
  return {
    key: input.key,
    expected: round2(input.expected),
    actual: round2(input.actual),
    difference,
    status: Math.abs(difference) <= 0.01 ? "ok" : "mismatch"
  };
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallback;
  return parsed;
}

function checksToCsv(checks: AuditCheck[]): string {
  const rows = [
    ["key", "expected", "actual", "difference", "status"].join(","),
    ...checks.map((item) =>
      [item.key, item.expected.toFixed(2), item.actual.toFixed(2), item.difference.toFixed(2), item.status].join(",")
    )
  ];
  return `\uFEFF${rows.join("\n")}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/metrics/audit.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const now = new Date();
    const from = parseDate(parsed.data.from, startOfMonth(now));
    const to = parseDate(parsed.data.to, endOfMonth(now));
    if (from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "Período inválido: from maior que to." }, { status: 400 });
    }

    let entries;
    try {
      const snapshot = await loadNormalizedTransactionsForScope({
        userId: auth.userId,
        from,
        to,
        excluded: false,
        hideCardPaymentMirrorInflow: false
      });
      entries = snapshot.entries.filter((entry) => !entry.excluded && !entry.isBalanceAdjustment);
    } catch (error) {
      if (error instanceof LedgerCoverageError) {
        return NextResponse.json(
          {
            code: "ledger_coverage_incomplete",
            message:
              "A cobertura do ledger está incompleta para auditoria. Corrija a sincronização antes de continuar.",
            details: {
              reason: error.resolution.reason,
              legacyTransactionCount: error.resolution.legacyTransactionCount,
              unmirroredLegacyTransactionCount: error.resolution.unmirroredLegacyTransactionCount,
              ledgerEntryCount: error.resolution.ledgerEntryCount
            }
          },
          { status: 409 }
        );
      }
      throw error;
    }

    const officialIncome = round2(
      entries
        .filter((item) => item.budgetImpact === "counts_as_income")
        .reduce((sum, item) => sum + item.budgetSignedAmount, 0)
    );
    const officialExpense = round2(
      entries
        .filter((item) => item.budgetImpact === "counts_as_expense")
        .reduce((sum, item) => sum + -item.budgetSignedAmount, 0)
    );
    const officialNet = round2(officialIncome - officialExpense);
    const officialTransfer = round2(
      entries
        .filter((item) => item.nature === "internal_transfer" || item.nature === "credit_card_payment")
        .reduce((sum, item) => sum + Math.abs(item.signedAmount), 0)
    );

    const categoriesExpense = round2(
      entries
        .filter((item) => item.budgetImpact === "counts_as_expense")
        .reduce((sum, item) => sum + -item.budgetSignedAmount, 0)
    );

    const perDay = new Map<string, { incomeCents: number; expenseCents: number }>();
    for (const item of entries) {
      const day = format(new Date(item.date), "yyyy-MM-dd");
      const current = perDay.get(day) ?? { incomeCents: 0, expenseCents: 0 };
      if (item.budgetImpact === "counts_as_income") {
        current.incomeCents += Math.round(item.budgetSignedAmount * 100);
      } else if (item.budgetImpact === "counts_as_expense") {
        current.expenseCents += Math.round(-item.budgetSignedAmount * 100);
      }
      perDay.set(day, current);
    }
    const timeSeriesIncome = round2([...perDay.values()].reduce((sum, item) => sum + item.incomeCents, 0) / 100);
    const timeSeriesExpense = round2([...perDay.values()].reduce((sum, item) => sum + item.expenseCents, 0) / 100);

    const accountNet = round2(entries.reduce((sum, item) => sum + item.signedAmount, 0));

    const checks: AuditCheck[] = [
      buildCheck({
        key: "categories_expense_equals_total_expense",
        expected: officialExpense,
        actual: categoriesExpense
      }),
      buildCheck({
        key: "timeseries_income_equals_total_income",
        expected: officialIncome,
        actual: timeSeriesIncome
      }),
      buildCheck({
        key: "timeseries_expense_equals_total_expense",
        expected: officialExpense,
        actual: timeSeriesExpense
      }),
      buildCheck({
        key: "account_net_equals_total_net",
        expected: officialNet,
        actual: accountNet
      })
    ];

    const mismatches = checks.filter((item) => item.status === "mismatch");

    if (parsed.data.format === "csv") {
      const csv = checksToCsv(checks);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"metrics-audit-${format(from, "yyyyMMdd")}-${format(to, "yyyyMMdd")}.csv\"`
        }
      });
    }

    return NextResponse.json({
      view: "metrics-audit",
      period: {
        from: from.toISOString(),
        to: to.toISOString()
      },
      totals: {
        income: officialIncome,
        expense: officialExpense,
        net: officialNet,
        transfer: officialTransfer
      },
      checks,
      mismatchCount: mismatches.length
    });
  });
}

