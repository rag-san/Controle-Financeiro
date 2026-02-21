"use client";

import { Select } from "@/components/ui/select";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { FormField } from "@/src/components/ui/FormField";
import { Input } from "@/src/components/ui/Input";

export type NewTransactionDraft = {
  date: string;
  description: string;
  amount: string;
  accountId: string;
  categoryId: string;
};

type TransactionFormProps = {
  values: NewTransactionDraft;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  busy?: boolean;
  error?: string;
  onChange: (next: Partial<NewTransactionDraft>) => void;
  onSubmit: () => Promise<void> | void;
  onCancel: () => void;
};

export function TransactionForm({
  values,
  accounts,
  categories,
  busy = false,
  error,
  onChange,
  onSubmit,
  onCancel
}: TransactionFormProps): React.JSX.Element {
  const canSubmit = Boolean(values.description.trim() && values.amount.trim() && values.accountId);

  return (
    <section className="surface-card p-4" aria-labelledby="tx-form-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="tx-form-title" className="text-base font-semibold">
          Nova transacao
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Fechar
        </Button>
      </div>

      <form
        className="grid gap-3 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        aria-busy={busy}
      >
        <FormField id="tx-date" label="Data" required>
          {(fieldProps) => <Input {...fieldProps} type="date" value={values.date} onChange={(event) => onChange({ date: event.target.value })} />}
        </FormField>

        <FormField id="tx-description" label="Descricao" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              value={values.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="Descricao da transacao"
            />
          )}
        </FormField>

        <FormField id="tx-amount" label="Valor" required hint="Use valor positivo para receita e negativo para despesa.">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="number"
              value={values.amount}
              onChange={(event) => onChange({ amount: event.target.value })}
            />
          )}
        </FormField>

        <FormField id="tx-account" label="Conta" required>
          {(fieldProps) => (
            <Select {...fieldProps} value={values.accountId} onChange={(event) => onChange({ accountId: event.target.value })}>
              <option value="">Selecione</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <div className="space-y-2">
          <FormField id="tx-category" label="Categoria (opcional)">
            {(fieldProps) => (
              <Select {...fieldProps} value={values.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <Button type="submit" className="w-full md:w-auto" isLoading={busy} disabled={!canSubmit || busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>

      {error ? <FeedbackMessage variant="error" className="mt-3">{error}</FeedbackMessage> : null}
    </section>
  );
}

