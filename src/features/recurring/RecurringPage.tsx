"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import type { CategoryDTO } from "@/lib/types";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { useToast } from "@/src/components/ui/ToastProvider";
import { RecurringSummaryCard } from "@/src/features/recurring/cards/RecurringSummaryCard";
import { CreateRecurringButton } from "@/src/features/recurring/components/CreateRecurringButton";
import {
  CreateRecurringModal,
  type CreateRecurringPayload
} from "@/src/features/recurring/components/CreateRecurringModal";
import { RecurringMonthList } from "@/src/features/recurring/components/RecurringMonthList";
import { RecurringTabs } from "@/src/features/recurring/components/RecurringTabs";
import type { RecurringBootstrapResponse, RecurringFlowTab, RecurringItem } from "@/src/features/recurring/types";
import {
  calculateRecurringTotals,
  groupRecurringItemsByDueDate,
  parseRecurringItems
} from "@/src/features/recurring/utils/recurringTotals";

export function RecurringPage(): React.JSX.Element {
  const { toast } = useToast();
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [activeTab, setActiveTab] = useState<RecurringFlowTab>("expenses");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const referenceDate = useMemo(() => new Date(), []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/recurring/bootstrap");
      const data = (await response.json()) as RecurringBootstrapResponse | { error?: string };

      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Falha ao carregar recorrentes.");
      }

      setItems(parseRecurringItems(data.items));
      setCategories(data.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar recorrentes.");
      setItems([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () => calculateRecurringTotals(items, activeTab, referenceDate),
    [items, activeTab, referenceDate]
  );

  const monthGroups = useMemo(
    () => groupRecurringItemsByDueDate(items, activeTab, referenceDate),
    [items, activeTab, referenceDate]
  );

  const handleCreate = useCallback(
    async (payload: CreateRecurringPayload): Promise<void> => {
      setBusy(true);
      try {
        const signedAmount = payload.flow === "expenses" ? Math.abs(payload.amount) : -Math.abs(payload.amount);
        const response = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload.name,
            amount: signedAmount,
            dueDay: payload.dueDay,
            categoryId: payload.categoryId,
            status: "active",
            lastPaidAt: payload.markAsPaidThisMonth ? new Date().toISOString() : null
          })
        });

        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Falha ao criar recorrente.");
        }

        setCreateOpen(false);
        await load();
        toast({
          variant: "success",
          title: "Recorrente criado",
          description: "O novo item recorrente foi adicionado."
        });
      } catch (createError) {
        toast({
          variant: "error",
          title: "Erro ao criar recorrente",
          description: createError instanceof Error ? createError.message : "Falha ao criar recorrente."
        });
      } finally {
        setBusy(false);
      }
    },
    [load, toast]
  );

  const handleTogglePaid = useCallback(
    async (item: RecurringItem, paid: boolean): Promise<void> => {
      setBusy(true);
      try {
        const response = await fetch(`/api/recurring/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lastPaidAt: paid ? new Date().toISOString() : null
          })
        });

        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Falha ao atualizar recorrente.");
        }

        await load();
        toast({
          variant: "success",
          title: paid ? "Pagamento registrado" : "Pagamento removido",
          description: `${item.name} atualizado com sucesso.`
        });
      } catch (updateError) {
        toast({
          variant: "error",
          title: "Erro ao atualizar item",
          description: updateError instanceof Error ? updateError.message : "Falha ao atualizar recorrente."
        });
      } finally {
        setBusy(false);
      }
    },
    [load, toast]
  );

  const actions = <CreateRecurringButton onClick={() => setCreateOpen(true)} />;

  return (
    <PageShell title="Recorrentes" subtitle="Assinaturas, cobranças e receitas recorrentes" actions={actions}>
      <div className="space-y-5">
        <div className="flex items-center">
          <RecurringTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : null}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        ) : (
          <>
            <RecurringSummaryCard totals={totals} />

            <section id={`recurring-panel-${activeTab}`} role="tabpanel" className="space-y-4">
              <RecurringMonthList
                groups={monthGroups}
                referenceDate={referenceDate}
                onCreateNew={() => setCreateOpen(true)}
                onTogglePaid={(item, paid) => void handleTogglePaid(item, paid)}
              />
            </section>
          </>
        )}
      </div>

      <CreateRecurringModal
        open={createOpen}
        flow={activeTab}
        categories={categories}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setCreateOpen(false);
        }}
        onSubmit={handleCreate}
      />
    </PageShell>
  );
}
