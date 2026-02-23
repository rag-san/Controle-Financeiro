"use client";

import { CreditCard, Eye, Link2, RefreshCcw, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import type { AccountDTO } from "@/lib/types";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { IconButton } from "@/src/components/ui/IconButton";
import { useToast } from "@/src/components/ui/ToastProvider";
import { AssetsDebtsCard } from "@/src/features/accounts/cards/AssetsDebtsCard";
import { AccountGroupCard } from "@/src/features/accounts/components/AccountGroupCard";
import { AccountRow } from "@/src/features/accounts/components/AccountRow";
import { ConnectAccountButton } from "@/src/features/accounts/components/ConnectAccountButton";
import { ConnectAccountModal } from "@/src/features/accounts/components/ConnectAccountModal";
import { ConnectionRow } from "@/src/features/accounts/components/ConnectionRow";
import type { AccountsRangeKey, NetWorthEntryDTO } from "@/src/features/accounts/types";
import {
  buildConnections,
  buildHistoricalAssetsDebtsSeries,
  buildPlaceholderSeries,
  deriveAccountsSummary,
  filterSeriesByInterval,
  resolvePreviousInterval,
  resolveRangeInterval,
  splitAccountGroups
} from "@/src/features/accounts/utils/accounts";
import { formatBRL } from "@/src/utils/format";

type ConnectAccountDraft = {
  name: string;
  type: AccountDTO["type"];
  institution: string;
  currency: string;
  parentAccountId: string;
};

function EmptyGroupRow({
  message,
  ctaLabel,
  onAction
}: {
  message: string;
  ctaLabel: string;
  onAction: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
      <span>{message}</span>
      <button
        type="button"
        onClick={onAction}
        className="rounded-md px-2 py-1 font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
      >
        {ctaLabel}
      </button>
    </div>
  );
}

export function AccountsPage(): React.JSX.Element {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [netWorthEntries, setNetWorthEntries] = useState<NetWorthEntryDTO[]>([]);
  const [selectedRange, setSelectedRange] = useState<AccountsRangeKey>("1M");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [connectErrorMessage, setConnectErrorMessage] = useState("");

  const loadAccountsData = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setErrorMessage("");

      try {
        const [accountsResponse, netWorthResponse] = await Promise.all([
          fetch("/api/accounts", { signal }),
          fetch("/api/net-worth", { signal })
        ]);

        const { data: accountsData, errorMessage: accountsParseError } = await parseApiResponse<
          AccountDTO[] | { error?: unknown }
        >(accountsResponse);

        if (accountsParseError) {
          throw new Error(accountsParseError);
        }

        if (!accountsResponse.ok || !accountsData || !Array.isArray(accountsData)) {
          throw new Error(extractApiError(accountsData, "Nao foi possivel carregar contas."));
        }

        const { data: netWorthData } = await parseApiResponse<NetWorthEntryDTO[] | { error?: unknown }>(
          netWorthResponse
        );

        const sanitizedNetWorth = netWorthResponse.ok && Array.isArray(netWorthData) ? netWorthData : [];

        setAccounts(accountsData);
        setNetWorthEntries(sanitizedNetWorth);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setAccounts([]);
        setNetWorthEntries([]);
        setErrorMessage(
          loadError instanceof Error ? loadError.message : "Nao foi possivel carregar dados das contas."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAccountsData(controller.signal);
    return () => controller.abort();
  }, [loadAccountsData]);

  const summary = useMemo(() => deriveAccountsSummary(accounts), [accounts]);
  const historicalSeries = useMemo(
    () => buildHistoricalAssetsDebtsSeries(netWorthEntries),
    [netWorthEntries]
  );

  const referenceDate = useMemo(() => {
    const latestPoint = historicalSeries[historicalSeries.length - 1];
    if (!latestPoint) return new Date();
    return new Date(`${latestPoint.date}T12:00:00`);
  }, [historicalSeries]);

  const currentInterval = useMemo(
    () => resolveRangeInterval(referenceDate, selectedRange),
    [referenceDate, selectedRange]
  );
  const previousInterval = useMemo(
    () => resolvePreviousInterval(currentInterval),
    [currentInterval]
  );

  const chartData = useMemo(() => {
    const historicalSlice = filterSeriesByInterval(historicalSeries, currentInterval);
    if (historicalSlice.length >= 2) {
      return historicalSlice;
    }

    return buildPlaceholderSeries(summary, selectedRange, currentInterval);
  }, [currentInterval, historicalSeries, selectedRange, summary]);

  const previousSummary = useMemo(() => {
    const previousHistory = filterSeriesByInterval(historicalSeries, previousInterval);
    if (previousHistory.length > 0) {
      const latest = previousHistory[previousHistory.length - 1];
      return { assets: latest.assets, debts: latest.debts };
    }

    // TODO: Replace fallback with true previous-period account snapshots when available.
    return summary;
  }, [historicalSeries, previousInterval, summary]);

  const { creditCards, bankAccounts } = useMemo(() => splitAccountGroups(accounts), [accounts]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const creditCardsGroupedByParent = useMemo(() => {
    const grouped = new Map<string, AccountDTO[]>();
    for (const card of creditCards) {
      const key = card.parentAccountId ?? "__unlinked__";
      const current = grouped.get(key) ?? [];
      current.push(card);
      grouped.set(key, current);
    }

    return [...grouped.entries()]
      .map(([parentId, cards]) => ({
        parentId: parentId === "__unlinked__" ? null : parentId,
        parent: parentId === "__unlinked__" ? null : accountById.get(parentId) ?? null,
        cards: cards.sort((left, right) => left.name.localeCompare(right.name))
      }))
      .sort((left, right) => {
        if (left.parent && right.parent) return left.parent.name.localeCompare(right.parent.name);
        if (left.parent && !right.parent) return -1;
        if (!left.parent && right.parent) return 1;
        return 0;
      });
  }, [accountById, creditCards]);
  const connections = useMemo(() => buildConnections(accounts), [accounts]);

  const totalCreditDebt = useMemo(
    () =>
      creditCards.reduce(
        (total, account) => total + Math.abs(Math.min(account.currentBalance ?? 0, 0)),
        0
      ),
    [creditCards]
  );
  const totalBankAssets = useMemo(
    () => bankAccounts.reduce((total, account) => total + (account.currentBalance ?? 0), 0),
    [bankAccounts]
  );

  const actions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <IconButton aria-label="Visualizar contas conectadas" icon={<Eye className="h-4 w-4" />} />
        <IconButton
          aria-label="Atualizar dados de contas"
          onClick={() => void loadAccountsData()}
          icon={<RefreshCcw className="h-4 w-4" />}
        />
        <ConnectAccountButton onClick={() => setConnectModalOpen(true)} />
      </div>
    ),
    [loadAccountsData]
  );

  const handleCreateManualAccount = useCallback(
    async (draft: ConnectAccountDraft): Promise<void> => {
      if (draft.name.trim().length < 2) {
        setConnectErrorMessage("Informe um nome com pelo menos 2 caracteres.");
        return;
      }

      setSavingAccount(true);
      setConnectErrorMessage("");

      try {
        const response = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            type: draft.type,
            institution: draft.institution.trim() || null,
            currency: draft.currency.trim().toUpperCase() || "BRL",
            parentAccountId: draft.type === "credit" ? draft.parentAccountId || null : null
          })
        });

        const { data, errorMessage } = await parseApiResponse<AccountDTO | { error?: unknown }>(response);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        if (!response.ok || !data || Array.isArray(data) || !("id" in data) || !("name" in data)) {
          throw new Error(extractApiError(data, "Nao foi possivel criar a conta."));
        }

        const createdAccount = data as AccountDTO;

        toast({
          variant: "success",
          title: "Conta criada",
          description: `${createdAccount.name} foi adicionada com sucesso.`
        });

        setConnectModalOpen(false);
        await loadAccountsData();
      } catch (createError) {
        const message =
          createError instanceof Error ? createError.message : "Falha ao salvar a conta.";
        setConnectErrorMessage(message);
      } finally {
        setSavingAccount(false);
      }
    },
    [loadAccountsData, toast]
  );

  return (
    <PageShell title="Contas" subtitle="Acompanhe ativos, dívidas e conexões financeiras" actions={actions}>
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-[150px] rounded-2xl" />
          <Skeleton className="h-[150px] rounded-2xl" />
          <Skeleton className="h-[150px] rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {errorMessage ? <FeedbackMessage variant="error">{errorMessage}</FeedbackMessage> : null}

          <AssetsDebtsCard
            assets={summary.assets}
            debts={summary.debts}
            previousAssets={previousSummary.assets}
            previousDebts={previousSummary.debts}
            chartData={chartData}
            selectedRange={selectedRange}
            onRangeChange={setSelectedRange}
            loading={loading}
          />

          <AccountGroupCard
            icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
            iconClassName="bg-rose-100 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300"
            title="Cartões de Crédito"
            subtitle={`${creditCards.length} contas`}
            totalLabel={`-${formatBRL(totalCreditDebt)}`}
          >
            {creditCards.length === 0 ? (
              <EmptyGroupRow
                message="No credit cards yet"
                ctaLabel="Conectar conta"
                onAction={() => setConnectModalOpen(true)}
              />
            ) : (
              creditCardsGroupedByParent.flatMap((group) => {
                const parentRow = group.parent ? (
                  <div
                    key={`parent-${group.parent.id}`}
                    className="border-b border-slate-200/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400"
                  >
                    {group.parent.name}
                  </div>
                ) : null;

                const cardRows = group.cards.map((account) => {
                  const debt = Math.abs(Math.min(account.currentBalance ?? 0, 0));
                  const institutionLabel = account.institution?.trim() || "Instituicao";

                  return (
                    <AccountRow
                      key={account.id}
                      name={`${group.parent ? "↳ " : ""}${account.name}`}
                      subtitle={`${institutionLabel} • Vence: --/--/----`}
                      amount={debt}
                      amountSign="negative"
                      amountTone={debt > 0 ? "negative" : "muted"}
                      metaRight={group.parent ? `Conta mae: ${group.parent.name}` : "Sem conta mae"}
                      iconClassName="bg-rose-100 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300"
                    />
                  );
                });

                return parentRow ? [parentRow, ...cardRows] : cardRows;
              })
            )}
          </AccountGroupCard>

          <AccountGroupCard
            icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
            iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Contas Bancárias"
            subtitle={`${bankAccounts.length} contas`}
            totalLabel={formatBRL(totalBankAssets)}
          >
            {bankAccounts.length === 0 ? (
              <EmptyGroupRow
                message="Nenhuma conta bancária encontrada"
                ctaLabel="Conectar conta"
                onAction={() => setConnectModalOpen(true)}
              />
            ) : (
              bankAccounts.map((account) => {
                const institution = account.institution?.trim() || "Conta Manual";
                const balance = account.currentBalance ?? 0;
                const amountTone = balance > 0 ? "default" : balance < 0 ? "negative" : "muted";
                const amountSign = balance > 0 ? "none" : balance < 0 ? "negative" : "none";

                return (
                  <AccountRow
                    key={account.id}
                    name={account.name}
                    subtitle={institution}
                    amount={Math.abs(balance)}
                    amountSign={amountSign}
                    amountTone={amountTone}
                    iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                  />
                );
              })
            )}
          </AccountGroupCard>

          <AccountGroupCard
            icon={<Link2 className="h-4 w-4" aria-hidden="true" />}
            iconClassName="bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
            title="Conexões"
            subtitle={`${connections.length} instituições conectadas`}
          >
            {connections.length === 0 ? (
              <EmptyGroupRow
                message="Nenhuma instituicao conectada"
                ctaLabel="Conectar conta"
                onAction={() => setConnectModalOpen(true)}
              />
            ) : (
              connections.map((connection) => (
                <ConnectionRow
                  key={connection.institution}
                  institution={connection.institution}
                  accountCount={connection.accountCount}
                  onDisconnect={() => {
                    toast({
                      variant: "info",
                      title: "Integracao pendente",
                      description: `Desconexao de ${connection.institution} sera habilitada em breve.`
                    });
                  }}
                />
              ))
            )}
          </AccountGroupCard>
        </div>
      )}

      <ConnectAccountModal
        open={connectModalOpen}
        accounts={accounts}
        busy={savingAccount}
        errorMessage={connectErrorMessage}
        onClose={() => {
          if (savingAccount) return;
          setConnectModalOpen(false);
          setConnectErrorMessage("");
        }}
        onSubmitManual={handleCreateManualAccount}
      />
    </PageShell>
  );
}
