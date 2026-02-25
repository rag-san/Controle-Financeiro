"use client";

import { Landmark, PlusCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { AccountDTO } from "@/lib/types";
import { Card } from "@/src/components/ui/Card";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { AllocationBar } from "@/src/features/networth/components/AllocationBar";
import { AssetDetailsPanel } from "@/src/features/networth/components/AssetDetailsPanel";
import { AssetRow } from "@/src/features/networth/components/AssetRow";
import { NetWorthTabs } from "@/src/features/networth/components/NetWorthTabs";
import { NetWorthSummaryCard } from "@/src/features/networth/cards/NetWorthSummaryCard";
import { NetWorthHistoryChart } from "@/src/features/networth/charts/NetWorthHistoryChart";
import type {
  AllocationItem,
  NetWorthEntryDTO,
  NetWorthRangeKey,
  NetWorthTabKey
} from "@/src/features/networth/types";
import {
  buildAllocationBreakdownItems,
  buildAllocationHistory,
  calculateAllocationItems
} from "@/src/features/networth/utils/calculateAllocation";
import { deriveSnapshotFromAccounts, getLatestSnapshot } from "@/src/features/networth/utils/calculateNetWorth";
import {
  buildDerivedSeriesFromSnapshot,
  buildHistorySeries,
  filterHistoryByInterval,
  resolveRangeInterval
} from "@/src/features/networth/utils/buildHistorySeries";
import {
  buildPreviousPeriodComparison,
  resolvePreviousInterval
} from "@/src/features/networth/utils/buildPreviousPeriodComparison";
import { formatBRL } from "@/src/utils/format";

type SelectedAllocationDetails = {
  type: "asset" | "debt";
  item: AllocationItem;
};

function toDateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function FadeInPanel({
  activeKey,
  children
}: {
  activeKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const rafId = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(rafId);
  }, [activeKey]);

  return <div className={`transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}>{children}</div>;
}

function EmptyAllocationState({
  message
}: {
  message: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <Landmark className="h-5 w-5 text-slate-400" aria-hidden="true" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        Adicionar ativo
      </Link>
    </div>
  );
}

function AllocationPanel({
  id,
  title,
  total,
  items,
  selectedItemId,
  onSelectItem
}: {
  id: "assets" | "debts";
  title: string;
  total: number;
  items: AllocationItem[];
  selectedItemId: string | null;
  onSelectItem: (item: AllocationItem) => void;
}): React.JSX.Element {
  const emptyMessage =
    id === "assets" ? "Nenhum ativo cadastrado ainda." : "Nenhuma dívida cadastrada para este período.";

  return (
    <section id={`networth-panel-${id}`} role="tabpanel" aria-labelledby={`networth-tab-${id}`}>
      <Card className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {title} <span className="text-slate-400">•</span> {formatBRL(total)}
        </h2>

        {items.length === 0 ? (
          <EmptyAllocationState message={emptyMessage} />
        ) : (
          <>
            <AllocationBar items={items} onItemSelect={onSelectItem} />

            <div className="overflow-x-auto rounded-xl border border-slate-200 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:border-slate-800 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
              <table className="w-full min-w-[520px] border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Nome
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Peso
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {items.map((item) => (
                    <AssetRow
                      key={item.id}
                      name={item.name}
                      weight={item.weight}
                      value={item.value}
                      color={item.color}
                      isActive={selectedItemId === item.id}
                      onSelect={() => onSelectItem(item)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

export function NetWorthPage(): React.JSX.Element {
  const [entries, setEntries] = useState<NetWorthEntryDTO[]>([]);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [range, setRange] = useState<NetWorthRangeKey>("1W");
  const [activeTab, setActiveTab] = useState<NetWorthTabKey>("assets");
  const [selectedDetails, setSelectedDetails] = useState<SelectedAllocationDetails | null>(null);
  const openTriggerRef = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [netWorthResponse, accountsResponse] = await Promise.all([
        fetch("/api/net-worth", { signal }),
        fetch("/api/accounts", { signal })
      ]);

      const { data: netWorthData, errorMessage: netWorthParseError } = await parseApiResponse<
        NetWorthEntryDTO[] | { error?: unknown }
      >(netWorthResponse);

      if (netWorthParseError) {
        throw new Error(netWorthParseError);
      }

      if (!netWorthResponse.ok || !netWorthData || !Array.isArray(netWorthData)) {
        throw new Error(extractApiError(netWorthData, "Não foi possível carregar patrimônio."));
      }

      const { data: accountsData } = await parseApiResponse<AccountDTO[] | { error?: unknown }>(
        accountsResponse
      );

      setEntries(netWorthData);
      setAccounts(accountsResponse.ok && Array.isArray(accountsData) ? accountsData : []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      setEntries([]);
      setAccounts([]);
      setErrorMessage(
        loadError instanceof Error ? loadError.message : "Falha ao carregar patrimônio."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const view = useMemo(() => {
    const timeline = buildHistorySeries(entries);
    const fallbackSnapshot = deriveSnapshotFromAccounts(accounts);

    const referenceDate =
      timeline.length > 0 ? toDateFromKey(timeline[timeline.length - 1].date) : new Date();
    const earliestDate = timeline.length > 0 ? toDateFromKey(timeline[0].date) : undefined;

    const currentInterval = resolveRangeInterval(range, referenceDate, earliestDate);
    const currentSlice = filterHistoryByInterval(timeline, currentInterval);
    const currentSeries =
      currentSlice.length > 0
        ? currentSlice
        : buildDerivedSeriesFromSnapshot(fallbackSnapshot, range, currentInterval);
    const currentSnapshot = getLatestSnapshot(currentSeries, fallbackSnapshot);

    const previousInterval = resolvePreviousInterval(currentInterval);
    const previousSlice = filterHistoryByInterval(timeline, previousInterval);
    const previousSnapshot = getLatestSnapshot(previousSlice, {
      assets: 0,
      debts: 0,
      net: 0
    });

    const chartSeries = buildPreviousPeriodComparison(currentSeries, previousSlice);
    const latestDateKey = currentSeries[currentSeries.length - 1]?.date ?? null;
    const fallbackSource = { accounts };

    const assetsAllocation = calculateAllocationItems(entries, latestDateKey, "asset", fallbackSource);
    const debtsAllocation = calculateAllocationItems(entries, latestDateKey, "debt", fallbackSource);

    return {
      chartSeries,
      currentSnapshot,
      previousSnapshot,
      assetsAllocation,
      debtsAllocation,
      latestDateKey
    };
  }, [accounts, entries, range]);

  const selectedHistory = useMemo(() => {
    if (!selectedDetails) {
      return [];
    }

    return buildAllocationHistory(entries, selectedDetails.type, selectedDetails.item.name);
  }, [entries, selectedDetails]);

  const selectedBreakdownItems = useMemo(() => {
    if (!selectedDetails) {
      return [];
    }

    return buildAllocationBreakdownItems(
      entries,
      view.latestDateKey,
      selectedDetails.type,
      selectedDetails.item.name,
      { accounts }
    );
  }, [accounts, entries, selectedDetails, view.latestDateKey]);

  const selectedTotalValue =
    selectedDetails?.type === "debt" ? view.currentSnapshot.debts : view.currentSnapshot.assets;

  useEffect(() => {
    setSelectedDetails((current) => {
      if (!current) return null;
      if (activeTab === "assets" && current.type === "asset") return current;
      if (activeTab === "debts" && current.type === "debt") return current;
      return null;
    });
  }, [activeTab]);

  const handleSelectItem = (type: "asset" | "debt", item: AllocationItem): void => {
    openTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedDetails({ type, item });
  };

  const handleCloseDetails = (): void => {
    setSelectedDetails(null);
    openTriggerRef.current?.focus();
  };

  return (
    <PageShell title="Patrimônio" subtitle="Acompanhe evolução, alocação e composição do patrimônio">
      {errorMessage ? <FeedbackMessage variant="error">{errorMessage}</FeedbackMessage> : null}

      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-2">
          <NetWorthSummaryCard
            netWorth={view.currentSnapshot.net}
            previousNetWorth={view.previousSnapshot.net}
            totalAssets={view.currentSnapshot.assets}
            totalDebts={view.currentSnapshot.debts}
            loading={loading}
          />
          <NetWorthHistoryChart
            data={view.chartSeries}
            range={range}
            onRangeChange={setRange}
            loading={loading}
          />
        </section>

        <section className="space-y-4">
          <NetWorthTabs
            activeTab={activeTab}
            assetsCount={view.assetsAllocation.length}
            debtsCount={view.debtsAllocation.length}
            onChange={setActiveTab}
          />

          {loading ? (
            <Card className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </Card>
          ) : (
            <FadeInPanel activeKey={activeTab}>
              {activeTab === "assets" ? (
                <AllocationPanel
                  id="assets"
                  title="Ativos"
                  total={view.currentSnapshot.assets}
                  items={view.assetsAllocation}
                  selectedItemId={selectedDetails?.type === "asset" ? selectedDetails.item.id : null}
                  onSelectItem={(item) => handleSelectItem("asset", item)}
                />
              ) : (
                <AllocationPanel
                  id="debts"
                  title="Dívidas"
                  total={view.currentSnapshot.debts}
                  items={view.debtsAllocation}
                  selectedItemId={selectedDetails?.type === "debt" ? selectedDetails.item.id : null}
                  onSelectItem={(item) => handleSelectItem("debt", item)}
                />
              )}
            </FadeInPanel>
          )}
        </section>
      </div>

      <AssetDetailsPanel
        open={selectedDetails !== null}
        title={selectedDetails?.type === "debt" ? "Detalhes da dívida" : "Detalhes do ativo"}
        item={selectedDetails?.item ?? null}
        totalValue={selectedTotalValue}
        history={selectedHistory}
        breakdownItems={selectedBreakdownItems}
        onClose={handleCloseDetails}
      />
    </PageShell>
  );
}

