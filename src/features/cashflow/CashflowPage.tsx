"use client";

import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { ExpensesCard } from "@/src/features/cashflow/cards/ExpensesCard";
import { IncomeCard } from "@/src/features/cashflow/cards/IncomeCard";
import { NetResultCard } from "@/src/features/cashflow/cards/NetResultCard";
import { PeriodSelect } from "@/src/features/cashflow/components/PeriodSelect";
import { useCashflowData } from "@/src/features/cashflow/hooks/useCashflowData";
import type { CashflowPeriodKey } from "@/src/features/cashflow/types";
import { CASHFLOW_PERIOD_OPTIONS } from "@/src/features/cashflow/utils/cashflow";

export function CashflowLoading(): React.JSX.Element {
  return (
    <div className="space-y-5" data-testid="cashflow-loading">
      <Skeleton className="h-[430px] rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-5">
        <Skeleton className="h-[410px] rounded-2xl xl:col-span-3" />
        <Skeleton className="h-[410px] rounded-2xl xl:col-span-2" />
      </div>
    </div>
  );
}

export function CashflowErrorState({ message }: { message?: string }): React.JSX.Element {
  return (
    <FeedbackMessage variant="error" data-testid="cashflow-error">
      {message || "Não foi possível carregar os dados de fluxo de caixa."}
    </FeedbackMessage>
  );
}

export function CashflowPage(): React.JSX.Element {
  const [period, setPeriod] = useState<CashflowPeriodKey>("3m");
  const { data, loading, error } = useCashflowData(period);
  const quickPeriodOptions = useMemo(
    () => CASHFLOW_PERIOD_OPTIONS.filter((option) => option.value !== "ytd"),
    []
  );

  const periodLabel = useMemo(() => {
    return CASHFLOW_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "Período selecionado";
  }, [period]);

  const actions = useMemo(
    () => (
      <PeriodSelect
        value={period}
        onChange={setPeriod}
        options={quickPeriodOptions}
        disabled={loading}
      />
    ),
    [loading, period, quickPeriodOptions]
  );

  return (
    <PageShell title="Fluxo de Caixa" subtitle="Resultados por período e comparação com ciclo anterior" actions={actions}>
      {loading ? (
        <CashflowLoading />
      ) : !data ? (
        <CashflowErrorState message={error} />
      ) : (
        <div className="space-y-5">
          <NetResultCard
            dateRangeLabel={data.currentRangeLabel}
            cashBalance={data.cashBalance}
            periodCashFlow={data.netResult.current}
            previousPeriodCashFlow={data.netResult.previous}
            chartData={data.netChart}
            isLoading={loading}
          />

          <div className="grid gap-4 xl:grid-cols-5 xl:items-stretch">
            <div className="min-w-0 h-full xl:col-span-3">
              <ExpensesCard
                periodLabel={periodLabel}
                dateRangeLabel={data.currentRangeLabel}
                totalExpense={data.expense.current}
                previousTotalExpense={data.expense.previous}
                classifiedExpense={data.classifiedExpense?.current}
                chartData={data.expensesChart}
                isLoading={loading}
              />
            </div>
            <div className="min-w-0 h-full xl:col-span-2">
              <IncomeCard
                dateRangeLabel={data.currentRangeLabel}
                totalIncome={data.income.current}
                previousTotalIncome={data.income.previous}
                classifiedIncome={data.classifiedIncome?.current}
                chartData={data.incomeChart}
                isLoading={loading}
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

