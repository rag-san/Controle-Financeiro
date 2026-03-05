import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { SankeyChart } from "@/src/features/reports/sankey/SankeyChart";
import type { SankeyModel } from "@/src/features/reports/sankey/types";
import { formatBRL } from "@/src/utils/format";

type SankeyCardProps = {
  model: SankeyModel;
};

export function SankeyCard({ model }: SankeyCardProps): React.JSX.Element {
  const chartNodes = model.nodes.filter((node) => node.kind !== "saved");
  const chartNodeIds = new Set(chartNodes.map((node) => node.id));
  const chartLinks = model.links.filter(
    (link) => chartNodeIds.has(link.source) && chartNodeIds.has(link.target)
  );
  const hasData = chartLinks.length > 0 && model.totalExpense > 0;
  const balance = model.netSaved;
  const balanceClass = balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const nodesById = new Map(chartNodes.map((node) => [node.id, node]));
  const expensesNodeId = chartNodes.find((node) => node.kind === "expenses")?.id ?? "expenses";
  const minWidthClass =
    chartNodes.length > 24 ? "min-w-[980px]" : chartNodes.length > 14 ? "min-w-[880px]" : "min-w-[760px]";
  const topExpenseFlows = chartLinks
    .filter((link) => link.source === expensesNodeId)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5)
    .map((link) => ({
      id: link.target,
      label: nodesById.get(link.target)?.label ?? "Categoria",
      value: link.value,
      color: nodesById.get(link.target)?.color ?? link.color
    }));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sankey (fase 2)
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="tabular-nums whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
            Receita {formatBRL(model.totalIncome)}
          </span>
          <span className="tabular-nums whitespace-nowrap font-medium text-rose-600 dark:text-rose-400">
            Despesa {formatBRL(model.totalExpense)}
          </span>
          <span className={`tabular-nums whitespace-nowrap font-medium ${balanceClass}`}>
            Economizado {formatBRL(balance)}
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="mt-3 rounded-xl border border-border/70 p-2 dark:border-border">
          <p className="sr-only">
            Fluxo financeiro da receita para despesas, detalhando categorias e subcategorias.
          </p>
          <p className="mb-2 text-xs text-muted-foreground sm:hidden dark:text-muted-foreground/80">
            Deslize horizontalmente para visualizar o fluxo completo.
          </p>
          <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border dark:[&::-webkit-scrollbar-thumb]:bg-border">
            <div className={`${minWidthClass} sm:min-w-0`}>
              <SankeyChart nodes={chartNodes} links={chartLinks} totalIncome={model.totalIncome} />
            </div>
          </div>

          {topExpenseFlows.length > 0 ? (
            <div className="mt-3 rounded-xl border border-border/70 bg-secondary/45 p-3 dark:border-border dark:bg-secondary/45">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Principais fluxos de despesas
              </p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {topExpenseFlows.map((flow) => (
                  <li key={flow.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: flow.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{flow.label}</span>
                    </span>
                    <span className="tabular-nums font-semibold text-foreground">
                      {formatBRL(flow.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border px-4 py-10 text-center dark:border-border">
          <p className="text-sm font-medium text-foreground">
            Sem dados para o período selecionado.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe transações para habilitar a visualização de fluxo.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-border dark:text-foreground dark:hover:bg-secondary"
          >
            Importar transações
          </Link>
        </div>
      )}
    </Card>
  );
}


