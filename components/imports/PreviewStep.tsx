import { formatMoney } from "@/lib/money";

type PreviewRow = {
  date: string;
  description: string;
  amount: number;
  accountHint?: string;
};

export function PreviewStep({ rows }: { rows: PreviewRow[] }): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card" role="region" aria-labelledby="import-preview-title">
      <div className="border-b border-border p-4">
        <h3 id="import-preview-title" className="font-semibold">
          Preview da importacao
        </h3>
        <p className="text-sm text-muted-foreground">Primeiras linhas apos normalizacao.</p>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="min-w-[620px] w-full text-sm">
          <caption className="sr-only">Tabela de linhas detectadas para importacao.</caption>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-3">Data</th>
              <th className="p-3">Descricao</th>
              <th className="p-3">Conta</th>
              <th className="p-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.description}-${index}`} className="border-b border-border/60">
                <td className="p-3">{new Date(row.date).toLocaleDateString("pt-BR")}</td>
                <td className="p-3">{row.description}</td>
                <td className="p-3">{row.accountHint ?? "-"}</td>
                <td className="p-3 text-right font-semibold">{formatMoney(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


