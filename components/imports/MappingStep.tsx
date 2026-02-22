"use client";

import { Select } from "@/components/ui/select";
import { Button } from "@/src/components/ui/Button";
import { FormField } from "@/src/components/ui/FormField";

type Mapping = {
  date: string;
  description: string;
  history: string;
  amount: string;
  debit: string;
  credit: string;
  type: string;
  account: string;
  balanceAfter: string;
};

type MappingStepProps = {
  columns: string[];
  mapping: Mapping;
  suggestedMapping?: Partial<Record<keyof Mapping, string>>;
  confidence?: {
    overall: "alta" | "media" | "baixa";
    fields?: Partial<Record<"date" | "description" | "amount", "alta" | "media" | "baixa">>;
    missingRequired?: string[];
  };
  onChange: (mapping: Mapping) => void;
  onConfirm: () => void;
};

export function MappingStep({
  columns,
  mapping,
  suggestedMapping,
  confidence,
  onChange,
  onConfirm
}: MappingStepProps): React.JSX.Element {
  const update = (key: keyof Mapping, value: string): void => {
    onChange({
      ...mapping,
      [key]: value
    });
  };

  const hasAmountSource = Boolean(mapping.amount || mapping.debit || mapping.credit);
  const ready = Boolean(mapping.date && mapping.description && hasAmountSource);
  const suggestionEntries = Object.entries(suggestedMapping ?? {}).filter(([, value]) => Boolean(value)) as Array<
    [keyof Mapping, string]
  >;

  const columnOptions = (
    <>
      {columns.map((column) => (
        <option key={column} value={column}>
          {column}
        </option>
      ))}
    </>
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-labelledby="mapping-step-title">
      <h3 id="mapping-step-title" className="text-base font-semibold">
        Mapeamento de colunas CSV
      </h3>
      {confidence ? (
        <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <p className="font-medium">
            Sugestao automatica: confianca {confidence.overall}.
          </p>
          {suggestionEntries.length > 0 ? (
            <p className="mt-1 text-muted-foreground">
              {suggestionEntries.map(([key, value]) => `${key}: ${value}`).join(" | ")}
            </p>
          ) : null}
          {confidence.missingRequired && confidence.missingRequired.length > 0 ? (
            <p className="mt-1 text-amber-700">
              Campos obrigatorios sem sugestao: {confidence.missingRequired.join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <FormField id="mapping-date" label="Data" required>
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.date} onChange={(event) => update("date", event.target.value)}>
              <option value="">Selecione</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-description" label="Descricao" required>
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.description} onChange={(event) => update("description", event.target.value)}>
              <option value="">Selecione</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-history" label="Historico (tipo da transacao)">
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.history} onChange={(event) => update("history", event.target.value)}>
              <option value="">Nenhum</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-amount" label="Valor" required hint="Preencha valor direto ou debito/credito.">
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.amount} onChange={(event) => update("amount", event.target.value)}>
              <option value="">Selecione</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-debit" label="Debito (opcional)">
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.debit} onChange={(event) => update("debit", event.target.value)}>
              <option value="">Nenhum</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-credit" label="Credito (opcional)">
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.credit} onChange={(event) => update("credit", event.target.value)}>
              <option value="">Nenhum</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-type" label="Tipo (opcional)">
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.type} onChange={(event) => update("type", event.target.value)}>
              <option value="">Nenhum</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-account" label="Conta no arquivo (opcional)" className="md:col-span-2">
          {(fieldProps) => (
            <Select {...fieldProps} value={mapping.account} onChange={(event) => update("account", event.target.value)}>
              <option value="">Nenhum</option>
              {columnOptions}
            </Select>
          )}
        </FormField>

        <FormField id="mapping-balance-after" label="Saldo apos (opcional)" className="md:col-span-2">
          {(fieldProps) => (
            <Select
              {...fieldProps}
              value={mapping.balanceAfter}
              onChange={(event) => update("balanceAfter", event.target.value)}
            >
              <option value="">Nenhum</option>
              {columnOptions}
            </Select>
          )}
        </FormField>
      </form>

      <div className="flex justify-end">
        <Button disabled={!ready} onClick={onConfirm} className="w-full sm:w-auto">
          Aplicar mapeamento
        </Button>
      </div>
    </section>
  );
}

