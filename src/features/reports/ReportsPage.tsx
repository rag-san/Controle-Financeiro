"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import type { AccountDTO, CategoryDTO, TransactionDTO } from "@/lib/types";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { IconButton } from "@/src/components/ui/IconButton";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { buildReportsModel } from "@/src/features/reports/buildReportsModel";
import { IncomeVsExpensesChartCard } from "@/src/features/reports/components/IncomeVsExpensesChartCard";
import { KpiGrid } from "@/src/features/reports/components/KpiGrid";
import { RecurringDetectedCard } from "@/src/features/reports/components/RecurringDetectedCard";
import { ReportsFilters } from "@/src/features/reports/components/ReportsFilters";
import { SpendingByCategoryCard } from "@/src/features/reports/components/SpendingByCategoryCard";
import { TopMerchantsCard } from "@/src/features/reports/components/TopMerchantsCard";
import { SankeyCard } from "@/src/features/reports/sankey/SankeyCard";
import type { ReportsPeriodPreset } from "@/src/features/reports/types";
import { buildPeriodComparison } from "@/src/features/reports/utils/period";

function ReportsLoading(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[130px] rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
      <Skeleton className="h-[150px] rounded-2xl" />
    </div>
  );
}

type TransactionsResponse = {
  items: TransactionDTO[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta?: {
    accounts?: AccountDTO[];
    categories?: CategoryDTO[];
  };
};

async function fetchAllTransactionsForReports(signal?: AbortSignal): Promise<{
  transactions: TransactionDTO[];
  accounts: AccountDTO[];
  categories: CategoryDTO[];
}> {
  const transactions: TransactionDTO[] = [];
  let accounts: AccountDTO[] = [];
  let categories: CategoryDTO[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = new URLSearchParams({
      period: "all",
      page: String(page),
      pageSize: "200"
    });

    if (page === 1) {
      query.set("includeMeta", "1");
    }

    const response = await fetch(`/api/transactions?${query.toString()}`, { signal });
    const payload = (await response.json()) as TransactionsResponse | { error?: string };

    if (!response.ok || !("items" in payload)) {
      throw new Error("error" in payload && payload.error ? payload.error : "Falha ao carregar dados de relatórios.");
    }

    transactions.push(...payload.items);

    if (page === 1) {
      accounts = payload.meta?.accounts ?? [];
      categories = payload.meta?.categories ?? [];
    }

    hasNextPage = payload.pagination.hasNextPage;
    page += 1;
  }

  return { transactions, accounts, categories };
}

export function ReportsPage(): React.JSX.Element {
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [preset, setPreset] = useState<ReportsPeriodPreset>("3M");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchAllTransactionsForReports(signal);
      setTransactions(payload.transactions);
      setAccounts(payload.accounts);
      setCategories(payload.categories);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const earliestDate = useMemo(() => {
    if (transactions.length === 0) return undefined;

    let minTimestamp = Number.POSITIVE_INFINITY;
    for (const transaction of transactions) {
      const timestamp = new Date(transaction.date).getTime();
      if (Number.isFinite(timestamp) && timestamp < minTimestamp) {
        minTimestamp = timestamp;
      }
    }

    return Number.isFinite(minTimestamp) ? new Date(minTimestamp) : undefined;
  }, [transactions]);

  const periodComparison = useMemo(
    () => buildPeriodComparison(preset, { now: new Date(), earliestDate }),
    [earliestDate, preset]
  );

  const model = useMemo(
    () =>
      buildReportsModel({
        transactions,
        categories,
        period: periodComparison,
        accountId: accountId || undefined,
        categoryId: categoryId || undefined
      }),
    [accountId, categories, categoryId, periodComparison, transactions]
  );

  const actions = (
    <IconButton
      aria-label="Atualizar relatórios"
      icon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
      onClick={() => void load()}
      disabled={loading}
    />
  );

  return (
    <PageShell
      title="Relatórios"
      subtitle="Visão consolidada por período com métricas e tendências financeiras"
      actions={actions}
    >
      {loading ? (
        <ReportsLoading />
      ) : error ? (
        <FeedbackMessage variant="error">{error}</FeedbackMessage>
      ) : (
        <div className="space-y-4">
          <ReportsFilters
            preset={preset}
            onPresetChange={setPreset}
            accounts={accounts}
            categories={categories}
            accountId={accountId}
            categoryId={categoryId}
            onAccountIdChange={setAccountId}
            onCategoryIdChange={setCategoryId}
            disabled={loading}
          />

          {!model.hasCurrentData ? (
            <EmptyState
              title="Sem dados para o período selecionado"
              description="Ajuste os filtros ou importe novas transações para gerar relatórios."
              ctaLabel="Import transactions"
              ctaHref="/transactions"
            />
          ) : (
            <>
              <KpiGrid current={model.currentTotals} previous={model.previousTotals} />

              <div className="grid gap-4 xl:grid-cols-2">
                <SpendingByCategoryCard items={model.categorySpending} />
                <IncomeVsExpensesChartCard data={model.timeSeries} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <TopMerchantsCard merchants={model.topMerchants} period={periodComparison.current} />
                <RecurringDetectedCard items={model.recurringDetected} />
              </div>
            </>
          )}

          <SankeyCard model={model.sankey} />
        </div>
      )}
    </PageShell>
  );
}
