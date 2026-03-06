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
      ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-100"
      : tone === "expense"
        ? "border-rose-300/50 bg-rose-500/10 text-rose-100"
        : "border-sky-300/50 bg-sky-500/10 text-sky-100";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${toneClasses}`}>
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-300/85">{label}</p>
      <p className="mt-2 tabular-nums text-xl font-black tracking-tight text-slate-50">{formatBRL(value)}</p>
    </div>
  );
}

export function SankeyCard({ model }: SankeyCardProps): React.JSX.Element {
  const hasData = model.links.length > 0 && model.totalExpense > 0;
  const minWidthClass =
    model.nodes.length > 10 ? "min-w-[980px]" : model.nodes.length > 7 ? "min-w-[900px]" : "min-w-[820px]";

  return (
    <Card
      className="overflow-hidden rounded-[28px] border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(25,37,71,0.98),_rgba(12,23,51,0.98)_45%,_rgba(7,14,30,1)_100%)] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.45)] md:p-5"
      data-testid="reports-sankey-card"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Fluxo financeiro</h3>
          <p className="max-w-2xl text-sm text-slate-400">
            Receitas do período distribuídas entre despesas reais e valor economizado.
          </p>
        </div>
        <Link
          href="/transactions"
          className="inline-flex rounded-full border border-slate-600/70 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

          <div className="rounded-2xl border border-white/10 bg-slate-950/10 px-4 py-3">
            <p className="sr-only">
              Fluxo financeiro da receita para despesas, economizado e principais categorias.
            </p>
            <p className="text-xs text-slate-400">
              Baseado em despesas reais do período. Transferências e pagamentos operacionais ficam consolidados para não distorcer o fluxo.
            </p>
            {model.hiddenOperationalCount > 0 ? (
              <p className="mt-1 text-xs font-medium text-slate-300">
                {model.hiddenOperationalCount} categoria(s) operacional(is) foram consolidadas em outras categorias: {formatBRL(model.hiddenOperationalExpense)}.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-400 sm:hidden">
              Deslize horizontalmente para visualizar o fluxo completo.
            </p>
            <div className="mt-3 overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/50">
              <div className={`${minWidthClass} sm:min-w-0`}>
                <SankeyChart nodes={model.nodes} links={model.links} totalIncome={model.totalIncome} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-600/70 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-100">Sem dados para o período selecionado.</p>
          <p className="mt-1 text-sm text-slate-400">
            Importe transações para habilitar a visualização de fluxo.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex rounded-lg border border-slate-600/70 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Importar transações
          </Link>
        </div>
      )}
    </Card>
  );
}
