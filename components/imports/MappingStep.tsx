"use client";

import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Mapping = {
  date: string;
  description: string;
  amount: string;
  debit: string;
  credit: string;
  type: string;
  account: string;
};

type MappingStepProps = {
  columns: string[];
  mapping: Mapping;
  onChange: (mapping: Mapping) => void;
  onConfirm: () => void;
};

export function MappingStep({ columns, mapping, onChange, onConfirm }: MappingStepProps): React.JSX.Element {
  const update = (key: keyof Mapping, value: string): void => {
    onChange({
      ...mapping,
      [key]: value
    });
  };

  const hasAmountSource = Boolean(mapping.amount || mapping.debit || mapping.credit);
  const ready = Boolean(mapping.date && mapping.description && hasAmountSource);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold">Mapeamento de colunas CSV</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Data</span>
          <Select value={mapping.date} onChange={(event) => update("date", event.target.value)}>
            <option value="">Selecione</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm">
          <span>Descricao</span>
          <Select
            value={mapping.description}
            onChange={(event) => update("description", event.target.value)}
          >
            <option value="">Selecione</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm">
          <span>Valor</span>
          <Select value={mapping.amount} onChange={(event) => update("amount", event.target.value)}>
            <option value="">Selecione</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm">
          <span>Debito (opcional)</span>
          <Select value={mapping.debit} onChange={(event) => update("debit", event.target.value)}>
            <option value="">Nenhum</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm">
          <span>Credito (opcional)</span>
          <Select value={mapping.credit} onChange={(event) => update("credit", event.target.value)}>
            <option value="">Nenhum</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm">
          <span>Tipo (opcional)</span>
          <Select value={mapping.type} onChange={(event) => update("type", event.target.value)}>
            <option value="">Nenhum</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span>Conta no arquivo (opcional)</span>
          <Select value={mapping.account} onChange={(event) => update("account", event.target.value)}>
            <option value="">Nenhum</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex justify-end">
        <Button disabled={!ready} onClick={onConfirm} className="w-full sm:w-auto">
          Aplicar mapeamento
        </Button>
      </div>
    </div>
  );
}


