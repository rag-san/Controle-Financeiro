import Link from "next/link";
import { Info } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { Card } from "@/src/components/ui/Card";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { formatBRL, formatPercent } from "@/src/utils/format";

interface PartialResultCardProps {
  resultadoAtual: number;
  porcentagemVariacao: number;
  resultadoMesAnterior: number;
  porcentagemProgresso: number;
  receita: number;
  gasto: number;
  excluido: number;
  hrefFluxoDeCaixa?: string;
}

function getVariationVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function getVariationLabel(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatPercent(Math.abs(value))}`;
}

export function PartialResultCard({
  resultadoAtual,
  porcentagemVariacao,
  resultadoMesAnterior,
  porcentagemProgresso,
  receita,
  gasto,
  excluido,
  hrefFluxoDeCaixa
}: PartialResultCardProps): React.JSX.Element {
  return (
    <Card className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">RESULTADO PARCIAL</h2>
            <button
              type="button"
              aria-label="Informacoes sobre resultado parcial"
              className="rounded-md p-1 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-3xl font-semibold text-slate-900">{formatBRL(resultadoAtual)}</p>
            <Badge value={getVariationLabel(porcentagemVariacao)} variant={getVariationVariant(porcentagemVariacao)} />
            <p className="text-sm text-slate-500">vs {formatBRL(resultadoMesAnterior)} mes anterior</p>
          </div>
        </div>

        {hrefFluxoDeCaixa ? (
          <Link
            href={hrefFluxoDeCaixa}
            className="text-sm font-medium text-slate-500 underline-offset-4 transition hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            fluxo de caixa ↗
          </Link>
        ) : null}
      </header>

      <ProgressBar percentage={porcentagemProgresso} color="blue" />

      <footer className="grid gap-4 border-t border-slate-200/70 pt-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Receita</p>
          <p className="text-right text-sm font-semibold text-slate-900">{formatBRL(receita)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gasto</p>
          <p className="text-right text-sm font-semibold text-slate-900">{formatBRL(gasto)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Excluido</p>
          <p className="text-right text-sm font-semibold text-slate-900">{formatBRL(excluido)}</p>
        </div>
      </footer>
    </Card>
  );
}

