"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { PageShell } from "@/components/layout/PageShell";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";

type ReviewPayload = {
  transferSuggestions: Array<{
    id: string;
    score: number;
    outEntryId: string;
    inEntryId: string;
    outEntry: {
      id: string;
      date: string;
      amount: number;
      accountId: string | null;
      accountName: string | null;
      description: string;
    } | null;
    inEntry: {
      id: string;
      date: string;
      amount: number;
      accountId: string | null;
      accountName: string | null;
      description: string;
    } | null;
  }>;
  unmatchedCardPayments: Array<{
    id: string;
    date: string;
    amount: number;
    description: string;
    accountId: string | null;
    accountName: string | null;
    creditCardAccountId: string | null;
    creditCardAccountName: string | null;
  }>;
  cards: Array<{
    id: string;
    name: string;
    defaultPaymentAccountId: string | null;
  }>;
};

type Envelope<T> = {
  data: T;
};

async function fetchReview(url: string): Promise<ReviewPayload> {
  const response = await fetch(url, { cache: "no-store" });
  const { data, errorMessage } = await parseApiResponse<Envelope<ReviewPayload> | { error?: unknown }>(response);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (!response.ok || !data || !("data" in data)) {
    throw new Error(extractApiError(data, "Não foi possível carregar a revisão."));
  }

  return data.data;
}

async function postJson(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (response.ok) {
    return;
  }

  const { data } = await parseApiResponse<{ error?: unknown }>(response);
  throw new Error(extractApiError(data, "Falha ao processar ação de revisão."));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("pt-BR");
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export function ReviewPage(): React.JSX.Element {
  const { data, error, isLoading, mutate } = useSWR<ReviewPayload>("/api/reconcile/review", fetchReview, {
    revalidateOnFocus: false
  });
  const [runningMatcher, setRunningMatcher] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [selectedCardByPayment, setSelectedCardByPayment] = useState<Record<string, string>>({});

  const selectedCardMap = useMemo(() => {
    const initial: Record<string, string> = {};
    if (!data) return initial;

    for (const payment of data.unmatchedCardPayments) {
      if (payment.creditCardAccountId) {
        initial[payment.id] = payment.creditCardAccountId;
      }
    }
    return {
      ...initial,
      ...selectedCardByPayment
    };
  }, [data, selectedCardByPayment]);

  const handleRunMatcher = async (): Promise<void> => {
    setRunningMatcher(true);
    setActionError("");
    try {
      await postJson("/api/reconcile/transfers/run", {});
      await mutate();
    } catch (runError) {
      setActionError(runError instanceof Error ? runError.message : "Falha ao executar reconciliador.");
    } finally {
      setRunningMatcher(false);
    }
  };

  const handleConfirmSuggestion = async (suggestionId: string, outEntryId: string, inEntryId: string): Promise<void> => {
    setBusySuggestionId(suggestionId);
    setActionError("");
    try {
      await postJson("/api/reconcile/transfers/confirm", {
        outEntryId,
        inEntryId
      });
      await mutate();
    } catch (confirmError) {
      setActionError(confirmError instanceof Error ? confirmError.message : "Falha ao confirmar transferência.");
    } finally {
      setBusySuggestionId(null);
    }
  };

  const handleRejectSuggestion = async (suggestionId: string): Promise<void> => {
    setBusySuggestionId(suggestionId);
    setActionError("");
    try {
      await postJson("/api/reconcile/transfers/reject", {
        suggestionId
      });
      await mutate();
    } catch (rejectError) {
      setActionError(rejectError instanceof Error ? rejectError.message : "Falha ao rejeitar sugestão.");
    } finally {
      setBusySuggestionId(null);
    }
  };

  const handleConfirmPayment = async (paymentId: string): Promise<void> => {
    const cardId = selectedCardMap[paymentId];
    if (!cardId) {
      setActionError("Selecione um cartão para confirmar o pagamento.");
      return;
    }

    setBusyPaymentId(paymentId);
    setActionError("");
    try {
      await postJson("/api/reconcile/cc/confirm-payment", {
        paymentEntryId: paymentId,
        creditCardAccountId: cardId
      });
      await mutate();
    } catch (confirmError) {
      setActionError(
        confirmError instanceof Error ? confirmError.message : "Falha ao conciliar pagamento de fatura."
      );
    } finally {
      setBusyPaymentId(null);
    }
  };

  return (
    <PageShell
      title="Revisão"
      subtitle="Conciliação de transferências internas e pagamentos de fatura pendentes"
      actions={
        <Button type="button" onClick={() => void handleRunMatcher()} disabled={runningMatcher}>
          {runningMatcher ? "Executando..." : "Rodar conciliador"}
        </Button>
      }
    >
      <div className="space-y-5">
        {error ? (
          <FeedbackMessage variant="error">
            {error instanceof Error ? error.message : "Falha ao carregar revisão."}
          </FeedbackMessage>
        ) : null}
        {actionError ? <FeedbackMessage variant="error">{actionError}</FeedbackMessage> : null}

        <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Transferências sugeridas</h2>
          {isLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Carregando sugestões...</p>
          ) : !data || data.transferSuggestions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sem sugestões pendentes.</p>
          ) : (
            <div className="space-y-3">
              {data.transferSuggestions.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Score: {item.score.toFixed(3)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleConfirmSuggestion(item.id, item.outEntryId, item.inEntryId)}
                        disabled={busySuggestionId === item.id}
                      >
                        Confirmar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRejectSuggestion(item.id)}
                        disabled={busySuggestionId === item.id}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Saída: {item.outEntry?.accountName ?? "Conta"} em {formatDate(item.outEntry?.date ?? "")} (
                    {formatMoney(item.outEntry?.amount ?? 0)})
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Entrada: {item.inEntry?.accountName ?? "Conta"} em {formatDate(item.inEntry?.date ?? "")} (
                    {formatMoney(item.inEntry?.amount ?? 0)})
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Pagamentos de fatura não conciliados
          </h2>
          {isLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Carregando pagamentos...</p>
          ) : !data || data.unmatchedCardPayments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sem pagamentos pendentes.</p>
          ) : (
            <div className="space-y-3">
              {data.unmatchedCardPayments.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(item.amount)} em {formatDate(item.date)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Conta origem: {item.accountName ?? "Não identificada"}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="h-9 min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      value={selectedCardMap[item.id] ?? ""}
                      onChange={(event) =>
                        setSelectedCardByPayment((previous) => ({
                          ...previous,
                          [item.id]: event.target.value
                        }))
                      }
                    >
                      <option value="">Selecionar cartão</option>
                      {(data?.cards ?? []).map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleConfirmPayment(item.id)}
                      disabled={busyPaymentId === item.id}
                    >
                      Confirmar vínculo
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
