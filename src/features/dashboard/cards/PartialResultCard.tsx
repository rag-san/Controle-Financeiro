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
  const deltaAbsoluto = Number((resultadoAtual - resultadoMesAnterior).toFixed(2));
  const useAbsoluteDeltaBadge = Math.abs(resultadoMesAnterior) < 1;
  const badgeVariant = resolveBadgeVariant(useAbsoluteDeltaBadge ? deltaAbsoluto : porcentagemVariacao);
  const badgeValue = useAbsoluteDeltaBadge
    ? `${deltaAbsoluto >= 0 ? "+" : "-"} ${formatBRL(Math.abs(deltaAbsoluto))}`
    : formatSignedPercent(porcentagemVariacao);
  const monthResultLabel = resultadoAtual >= 0 ? "economia no mes" : "deficit no mes";

  return (
    <Card className="h-full" data-testid="dashboard-partial-result-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-muted-foreground">
            <span>Resultado parcial</span>
            <Info className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden="true" />
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Comparativo do {periodDescription}.</p>
        </div>
        <Link
          href={hrefFluxoDeCaixa}
          className="text-xs font-semibold text-primary transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          fluxo de caixa ↗
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="break-words text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {formatBRL(resultadoAtual)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge value={badgeValue} variant={badgeVariant} />
            <span>{monthResultLabel}</span>
            <span>vs {formatBRL(resultadoMesAnterior)} mes anterior</span>
          </div>
        </div>

        <ProgressBar percentage={porcentagemProgresso} color="blue" className="h-1.5 bg-secondary/90" />

        <div className="grid grid-cols-1 gap-4 border-t border-border/70 pt-4 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-muted-foreground">Entrada caixa</p>
            <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{formatBRL(receita)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Saida caixa</p>
            <p className="text-xl font-semibold text-rose-700 dark:text-rose-300">{formatBRL(gasto)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Excluido</p>
            <p className="text-xl font-semibold text-foreground">{formatBRL(excluido)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
