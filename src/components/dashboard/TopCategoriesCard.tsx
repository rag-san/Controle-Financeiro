import Link from "next/link";
import { Badge } from "@/src/components/ui/Badge";
import { Card } from "@/src/components/ui/Card";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { formatBRL, formatPercent } from "@/src/utils/format";

type VariationStatus = "positivo" | "negativo" | "neutro";

interface TopCategory {
  id: string;
  corDot: string;
  icone: React.ReactNode;
  nome: string;
  valorAtual: number;
  percentualBarra: number;
  percentualVariacao: number;
  valorAnterior: number;
  statusDaVariacao: VariationStatus;
}

interface TopCategoriesCardProps {
  categorias: TopCategory[];
  hrefVerMais?: string;
}

function getProgressColor(status: VariationStatus): "green" | "red" | "gray" {
  if (status === "positivo") return "green";
  if (status === "negativo") return "red";
  return "gray";
}

function getBadgeVariant(status: VariationStatus): "positive" | "negative" | "neutral" {
  if (status === "positivo") return "positive";
  if (status === "negativo") return "negative";
  return "neutral";
}

function getVariationLabel(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatPercent(Math.abs(value))}`;
}

export function TopCategoriesCard({ categorias, hrefVerMais }: TopCategoriesCardProps): React.JSX.Element {
  return (
    <Card className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">TOP CATEGORIAS</h2>
        {hrefVerMais ? (
          <Link
            href={hrefVerMais}
            className="text-sm font-medium text-slate-500 underline-offset-4 transition hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            ver mais
          </Link>
        ) : null}
      </header>

      <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-4 border-b border-slate-200/80 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
        <span>Categoria</span>
        <span className="text-right">Atual</span>
        <span>vs Mes Anterior</span>
        <span className="text-right">Variacao</span>
        <span className="text-right">Anterior</span>
      </div>

      <div className="space-y-3">
        {categorias.length === 0 ? (
          <div
            role="status"
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
          >
            Nenhuma categoria disponivel para o periodo selecionado.
          </div>
        ) : null}

        {categorias.map((categoria) => (
          <article
            key={categoria.id}
            className="grid gap-3 rounded-xl border border-slate-200/70 p-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] md:items-center dark:border-slate-700/70"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoria.corDot }} aria-hidden="true" />
              <span className="text-slate-500" aria-hidden="true">
                {categoria.icone}
              </span>
              <span className="font-medium text-slate-800">{categoria.nome}</span>
            </div>

            <div className="space-y-1 md:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Atual</p>
              <p className="font-semibold text-slate-900">{formatBRL(categoria.valorAtual)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">vs Mes Anterior</p>
              <ProgressBar percentage={categoria.percentualBarra} color={getProgressColor(categoria.statusDaVariacao)} />
            </div>

            <div className="space-y-1 md:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Variacao</p>
              <Badge value={getVariationLabel(categoria.percentualVariacao)} variant={getBadgeVariant(categoria.statusDaVariacao)} />
            </div>

            <div className="space-y-1 md:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Anterior</p>
              <p className="font-semibold text-slate-900">{formatBRL(categoria.valorAnterior)}</p>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
