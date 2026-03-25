import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { SankeyChart } from "@/src/features/reports/sankey/SankeyChart";
import type { SankeyModel } from "@/src/features/reports/sankey/types";
import { formatBRL } from "@/src/utils/format";

type SankeyCardProps = {
  model: SankeyModel;
};

function SummaryMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "income" | "expense" | "saved";
}): React.JSX.Element {
  const toneClasses =
    tone === "income"
      ? "border-success/20 bg-success/10 text-success"
      : tone === "expense"
        ? "border-error/20 bg-error/10 text-error"
        : "border-info/20 bg-info/10 text-info";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-[inset_0_1px_0_hsl(var(--overlay)/0.04)] ${toneClasses}`}>
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 tabular-nums text-xl font-black tracking-tight text-foreground">{formatBRL(value)}</p>
    </div>
  );
}

export function SankeyCard({ model }: SankeyCardProps): React.JSX.Element {
  const hasData = model.links.length > 0 && model.totalExpense > 0;
  const minWidthClass =
    model.nodes.length > 10 ? "min-w-[980px]" : model.nodes.length > 7 ? "min-w-[900px]" : "min-w-[820px]";

  return (
    <Card
      className="overflow-hidden rounded-[28px] border border-border/80 bg-gradient-to-b from-card via-card to-secondary/60 p-4 shadow-[0_24px_70px_hsl(var(--overlay)/0.18)] md:p-5"
      data-testid="reports-sankey-card"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fluxo financeiro</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Receitas do período distribuídas entre despesas reais e valor economizado.
          </p>
        </div>
        <Link
          href="/transactions"
          className="inline-flex rounded-full border border-border/80 bg-secondary/50 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver transações
        </Link>
      </div>

      {hasData ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryMetric label="Receitas" value={model.totalIncome} tone="income" />
            <SummaryMetric label="Despesas reais" value={model.totalExpense} tone="expense" />
            <SummaryMetric label="Economizado" value={Math.max(0, model.netSaved)} tone="saved" />
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3">
            <p className="sr-only">
              Fluxo financeiro da receita para despesas, economizado e principais categorias.
            </p>
            <p className="text-xs text-muted-foreground">
              Baseado em despesas reais do período. Transferências e pagamentos operacionais ficam consolidados para não distorcer o fluxo.
            </p>
            {model.hiddenOperationalCount > 0 ? (
              <p className="mt-1 text-xs font-medium text-foreground">
                {model.hiddenOperationalCount} categoria(s) operacional(is) foram consolidadas em outras categorias: {formatBRL(model.hiddenOperationalExpense)}.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground sm:hidden">
              Deslize horizontalmente para visualizar o fluxo completo.
            </p>
            <div className="mt-3 overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
              <div className={`${minWidthClass} sm:min-w-0`}>
                <SankeyChart nodes={model.nodes} links={model.links} totalIncome={model.totalIncome} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border/80 px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Sem dados para o período selecionado.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe transações para habilitar a visualização de fluxo.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex rounded-lg border border-border/80 px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Importar transações
          </Link>
        </div>
      )}
    </Card>
  );
}
