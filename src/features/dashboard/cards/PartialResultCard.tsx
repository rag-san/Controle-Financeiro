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
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span>Resultado parcial</span>
            <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">Comparativo do {periodDescription}.</p>
        </div>
        <Link
          href={hrefFluxoDeCaixa}
          className="text-sm font-semibold text-blue-500 transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          fluxo de caixa ↗
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{formatBRL(resultadoAtual)}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge value={formatSignedPercent(porcentagemVariacao)} variant={resolveBadgeVariant(porcentagemVariacao)} />
            <span>vs {formatBRL(resultadoMesAnterior)} mes anterior</span>
          </div>
        </div>

        <ProgressBar percentage={porcentagemProgresso} color="blue" />

        <div className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-4 text-sm dark:border-border">
          <div className="space-y-1">
            <p className="text-muted-foreground">Receita</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{formatBRL(receita)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Gasto</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{formatBRL(gasto)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Excluido</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{formatBRL(excluido)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
