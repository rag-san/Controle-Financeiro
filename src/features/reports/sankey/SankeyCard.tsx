import Link from "next/link";
import { Card } from "@/src/components/ui/Card";
import { SankeyChart } from "@/src/features/reports/sankey/SankeyChart";
import type { SankeyModel } from "@/src/features/reports/sankey/types";
import { formatBRL } from "@/src/utils/format";

type SankeyCardProps = {
  model: SankeyModel;
};

export function SankeyCard({ model }: SankeyCardProps): React.JSX.Element {
  const hasData = model.links.length > 0 && (model.totalIncome > 0 || model.totalExpense > 0);
  const balance = model.netSaved;
  const balanceClass = balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
            Saldo {formatBRL(balance)}
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="mt-3 rounded-xl border border-slate-200/70 p-2 dark:border-slate-700">
          <p className="sr-only">
            Fluxo financeiro com receita para despesas e economizado, detalhando categorias e subcategorias.
          </p>
          <SankeyChart nodes={model.nodes} links={model.links} totalIncome={model.totalIncome} />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-700">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Sem dados para o período selecionado.
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Importe transações para habilitar a visualização de fluxo.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Importar transações
          </Link>
        </div>
      )}
    </Card>
  );
}
