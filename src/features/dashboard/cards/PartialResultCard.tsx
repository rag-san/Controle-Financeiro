import Link from "next/link";
import { Info } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { ProgressBar } from "@/src/components/ui/ProgressBar";
import { formatBRL, formatSignedPercent } from "@/src/utils/format";

interface PartialResultCardProps {
  resultadoAtual: number;
  porcentagemVariacao: number;
  resultadoMesAnterior: number;
  porcentagemProgresso: number;
  receita: number;
  gasto: number;
  excluido: number;
  hrefFluxoDeCaixa?: string;
  periodDescription: string;
}

function resolveBadgeVariant(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function PartialResultCard({
  resultadoAtual,
  porcentagemVariacao,
  resultadoMesAnterior,
  porcentagemProgresso,
  receita,
  gasto,
  excluido,
  hrefFluxoDeCaixa = "/cashflow",
  periodDescription
}: PartialResultCardProps): React.JSX.Element {
  return (
    <Card className="h-full border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/70 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/70">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-slate-500 dark:text-slate-400">
            <span>Resultado parcial</span>
            <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comparativo do {periodDescription}.</p>
        </div>
        <Link
          href={hrefFluxoDeCaixa}
          className="text-xs font-semibold text-sky-700 transition hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300 dark:hover:text-sky-200"
        >
          fluxo de caixa ↗
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {formatBRL(resultadoAtual)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Badge
              value={formatSignedPercent(porcentagemVariacao)}
              variant={resolveBadgeVariant(porcentagemVariacao)}
            />
            <span>vs {formatBRL(resultadoMesAnterior)} mes anterior</span>
          </div>
        </div>

        <ProgressBar percentage={porcentagemProgresso} color="blue" className="h-1.5 bg-slate-200/90 dark:bg-slate-800" />

        <div className="grid grid-cols-1 gap-4 border-t border-slate-200/80 pt-4 text-sm sm:grid-cols-3 dark:border-slate-800">
          <div className="space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Receita</p>
            <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{formatBRL(receita)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Gasto</p>
            <p className="text-xl font-semibold text-rose-700 dark:text-rose-300">{formatBRL(gasto)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Excluido</p>
            <p className="text-xl font-semibold text-slate-700 dark:text-slate-200">{formatBRL(excluido)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
