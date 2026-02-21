"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { ExpensesCard } from "@/src/features/cashflow/cards/ExpensesCard";
import { IncomeCard } from "@/src/features/cashflow/cards/IncomeCard";
import { NetResultCard } from "@/src/features/cashflow/cards/NetResultCard";
import { PeriodSelect } from "@/src/features/cashflow/components/PeriodSelect";
import { useCashflowData } from "@/src/features/cashflow/hooks/useCashflowData";
import type { CashflowPeriodKey } from "@/src/features/cashflow/types";
import { CASHFLOW_PERIOD_OPTIONS } from "@/src/features/cashflow/utils/cashflow";

function CashflowLoading(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[440px] rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[380px] rounded-2xl" />
        <Skeleton className="h-[380px] rounded-2xl" />
      </div>
    </div>
  );
}

export function CashflowPage(): React.JSX.Element {
  const [period, setPeriod] = useState<CashflowPeriodKey>("3m");
  const { data, loading, error } = useCashflowData(period);
  const periodLabel = useMemo(() => {
    return CASHFLOW_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "Período selecionado";
  }, [period]);

  const actions = useMemo(
    () => (
      <PeriodSelect
        value={period}
        onChange={setPeriod}
        options={CASHFLOW_PERIOD_OPTIONS}
        disabled={loading}
      />
    ),
    [loading, period]
  );

  return (
    <PageShell title="Fluxo de Caixa" subtitle="Resultados por período e comparação com ciclo anterior" actions={actions}>
      {loading ? (
        <CashflowLoading />
      ) : !data ? (
        <FeedbackMessage variant="error">
          {error || "Nao foi possivel carregar os dados de fluxo de caixa."}
        </FeedbackMessage>
      ) : (
        <div className="space-y-4">
          <NetResultCard
            dateRangeLabel={data.currentRangeLabel}
            totalNet={data.netResult.current}
            previousTotalNet={data.netResult.previous}
            chartData={data.netChart}
            isLoading={loading}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <ExpensesCard
              periodLabel={periodLabel}
              dateRangeLabel={data.currentRangeLabel}
              totalExpense={data.expense.current}
              previousTotalExpense={data.expense.previous}
              chartData={data.expensesChart}
              isLoading={loading}
            />
            <IncomeCard
              dateRangeLabel={data.currentRangeLabel}
              totalIncome={data.income.current}
              previousTotalIncome={data.income.previous}
              chartData={data.incomeChart}
              isLoading={loading}
            />
          </div>
        </div>
      )}
    </PageShell>
  );
}
