import { formatMoney } from "@/lib/money";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";

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
  onCategoryChange,
  onSaveRuleChange
}: {
  rows: PreviewRow[];
  categories?: CategoryOption[];
  manualCategoryByCommitIndex?: Record<number, string>;
  saveRuleByCommitIndex?: Record<number, boolean>;
  onCategoryChange?: (commitIndex: number, categoryId: string) => void;
  onSaveRuleChange?: (commitIndex: number, value: boolean) => void;
}): React.JSX.Element {
  const hasRows = rows.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card" role="region" aria-labelledby="import-preview-title">
      <div className="border-b border-border p-4">
        <h3 id="import-preview-title" className="font-semibold">
          Preview da importacao
        </h3>
        <p className="text-sm text-muted-foreground">Status por linha apos parse e normalizacao.</p>
      </div>
      {!hasRows ? (
        <div className="p-4 text-sm text-muted-foreground">Nenhuma linha disponivel para preview.</div>
      ) : (
        <div className="max-h-80 overflow-auto">
        <table className="min-w-[980px] w-full text-sm">
          <caption className="sr-only">Tabela de linhas detectadas para importacao.</caption>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
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
            {rows.map((row, index) => (
              <tr key={`${row.line ?? index}-${row.description ?? "linha"}-${index}`} className="border-b border-border/60 align-top">
                <td className="p-3">{row.line ?? index + 1}</td>
                <td className="p-3">{row.date ? new Date(row.date).toLocaleDateString("pt-BR") : "-"}</td>
                <td className="p-3">{row.transactionKind?.trim() ? row.transactionKind : "-"}</td>
                <td className="p-3">
                  <div className="space-y-1">
                    <div>{row.counterparty?.trim() ? row.counterparty : row.description?.trim() ? row.description : "-"}</div>
                    {row.merchantKey ? <div className="text-xs text-muted-foreground">{row.merchantKey}</div> : null}
                  </div>
                </td>
                <td className="p-3">{row.accountHint ?? "-"}</td>
                <td className="p-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${rowStatusClassName(row.status)}`}>
                    {rowStatusLabel(row.status)}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{row.reason ?? row.reasonCode ?? "-"}</td>
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
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}


