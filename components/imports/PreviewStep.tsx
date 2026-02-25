import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { Input } from "@/src/components/ui/Input";

type PreviewRow = {
  line?: number;
  commitIndex?: number | null;
  date?: string | null;
  description?: string;
  transactionKind?: string;
  counterparty?: string;
  merchantKey?: string;
  amount?: number | null;
  accountHint?: string;
  status?: "ok" | "ignored" | "error";
  reason?: string;
  reasonCode?: string;
};

type CategoryOption = {
  id: string;
  name: string;
};

type PreviewFilter = "all" | "error" | "ignored";

function rowStatusLabel(status: PreviewRow["status"]): string {
  if (status === "ignored") return "Ignorada";
  if (status === "error") return "Erro";
  return "OK";
}

function rowStatusClassName(status: PreviewRow["status"]): string {
  if (status === "ignored") return "bg-amber-100 text-amber-800";
  if (status === "error") return "bg-rose-100 text-rose-800";
  return "bg-emerald-100 text-emerald-800";
}

export function PreviewStep({
  rows,
  categories = [],
  manualCategoryByCommitIndex = {},
  saveRuleByCommitIndex = {},
  maxHeightClassName,
  onCategoryChange,
  onSaveRuleChange
}: {
  rows: PreviewRow[];
  categories?: CategoryOption[];
  manualCategoryByCommitIndex?: Record<number, string>;
  saveRuleByCommitIndex?: Record<number, boolean>;
  maxHeightClassName?: string;
  onCategoryChange?: (commitIndex: number, categoryId: string) => void;
  onSaveRuleChange?: (commitIndex: number, value: boolean) => void;
}): React.JSX.Element {
  const [filter, setFilter] = React.useState<PreviewFilter>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasRows = rows.length > 0;

  const rowsByStatus = React.useMemo(
    () => ({
      all: rows.length,
      error: rows.filter((row) => row.status === "error").length,
      ignored: rows.filter((row) => row.status === "ignored").length
    }),
    [rows]
  );

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (filter === "error" && row.status !== "error") return false;
      if (filter === "ignored" && row.status !== "ignored") return false;

      if (!normalizedQuery) return true;

      const searchable = [
        row.counterparty,
        row.description,
        row.merchantKey,
        row.reason,
        row.reasonCode
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [filter, normalizedQuery, rows]);

  const previewFilterOptions = React.useMemo(
    () =>
      [
        { value: "all", label: `Todas (${rowsByStatus.all})` },
        { value: "error", label: `Somente erros (${rowsByStatus.error})` },
        { value: "ignored", label: `Somente ignoradas (${rowsByStatus.ignored})` }
      ] as const,
    [rowsByStatus]
  );

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card"
      role="region"
      aria-labelledby="import-preview-title"
    >
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 id="import-preview-title" className="font-semibold">
              Preview da importacao
            </h3>
            <p className="text-sm text-muted-foreground">Status por linha apos parse e normalizacao.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mostrando {filteredRows.length} de {rows.length} linhas.
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <SegmentedControl
              ariaLabel="Filtrar linhas do preview"
              options={previewFilterOptions}
              value={filter}
              onChange={(nextValue) => setFilter(nextValue)}
            />
            <div className="w-full lg:w-72">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por destino ou descricao"
                aria-label="Buscar no preview por destino detectado ou descricao"
              />
            </div>
          </div>
        </div>
      </div>
      {!hasRows ? (
        <div className="p-4 text-sm text-muted-foreground">Nenhuma linha disponivel para preview.</div>
      ) : filteredRows.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          Nenhuma linha encontrada para o filtro atual.
        </div>
      ) : (
        <div
          className={cn(
            "max-h-80 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700",
            maxHeightClassName
          )}
        >
          <table className="min-w-[1080px] w-full text-sm">
            <caption className="sr-only">Tabela de linhas detectadas para importacao.</caption>
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-3">Linha</th>
                <th className="p-3">Data</th>
                <th className="p-3">Tipo detectado</th>
                <th className="p-3">Destino detectado</th>
                <th className="p-3">Conta</th>
                <th className="p-3">Status</th>
                <th className="p-3">Motivo</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Salvar regra</th>
                <th className="p-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                const detectedDestination = row.counterparty?.trim()
                  ? row.counterparty
                  : row.description?.trim()
                    ? row.description
                    : "-";
                const reasonText = row.reason ?? row.reasonCode ?? "-";
                const rowKey = `${row.line ?? index}-${row.description ?? "linha"}-${index}`;

                return (
                  <tr
                    key={rowKey}
                    className={cn(
                      "border-b border-border/60 align-top transition-colors odd:bg-background even:bg-muted/10 hover:bg-muted/25",
                      row.status === "error" &&
                        "bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-950/20 dark:hover:bg-rose-950/30",
                      row.status === "ignored" &&
                        "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
                    )}
                  >
                    <td className="p-3">{row.line ?? index + 1}</td>
                    <td className="p-3">{row.date ? new Date(row.date).toLocaleDateString("pt-BR") : "-"}</td>
                    <td className="max-w-[170px] p-3" title={row.transactionKind?.trim() ? row.transactionKind : "-"}>
                      <span className="block truncate">{row.transactionKind?.trim() ? row.transactionKind : "-"}</span>
                    </td>
                    <td className="max-w-[260px] p-3" title={detectedDestination}>
                      <div className="space-y-1">
                        <div className="truncate">{detectedDestination}</div>
                        {row.merchantKey ? (
                          <div className="truncate text-xs text-muted-foreground" title={row.merchantKey}>
                            {row.merchantKey}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[170px] p-3" title={row.accountHint ?? "-"}>
                      <span className="block truncate">{row.accountHint ?? "-"}</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full border border-current/10 px-2 py-0.5 text-xs font-semibold ${rowStatusClassName(row.status)}`}
                      >
                        {rowStatusLabel(row.status)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "max-w-[250px] p-3 text-xs",
                        row.status === "ok" ? "text-muted-foreground" : "text-foreground"
                      )}
                      title={reasonText}
                    >
                      <span className="block truncate">{reasonText}</span>
                    </td>
                    <td className="p-3">
                      {row.status === "ok" && typeof row.commitIndex === "number" ? (
                        <Select
                          value={manualCategoryByCommitIndex[row.commitIndex] ?? ""}
                          onChange={(event) => onCategoryChange?.(row.commitIndex ?? -1, event.target.value)}
                        >
                          <option value="">Sem categoria</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.status === "ok" &&
                      typeof row.commitIndex === "number" &&
                      Boolean(manualCategoryByCommitIndex[row.commitIndex]) &&
                      row.merchantKey &&
                      row.merchantKey !== "transacao" ? (
                        <label className="inline-flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={Boolean(saveRuleByCommitIndex[row.commitIndex])}
                            onChange={(event) =>
                              onSaveRuleChange?.(row.commitIndex ?? -1, Boolean(event.target.checked))
                            }
                          />
                          Salvar
                        </label>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {typeof row.amount === "number" ? formatMoney(row.amount) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

