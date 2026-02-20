import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DefaultChartTooltip } from "@/src/components/charts/DefaultChartTooltip";
import { Badge } from "@/src/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { formatBRL, formatBRLCompact, formatMonthLabel } from "@/src/utils/format";

export type NetWorthFilter = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

type NetWorthPoint = {
  date: string;
  value: number;
};

interface NetWorthCardProps {
  valorTotal: number;
  variacao: number;
  isDataAvailable: boolean;
  activeFilter: NetWorthFilter;
  onFilterChange?: (filter: NetWorthFilter) => void;
  hrefVerTodas?: string;
  periodDescription: string;
  series: NetWorthPoint[];
}

const filterOptions = [
  { label: "1D", value: "1D" },
  { label: "1W", value: "1W" },
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "YTD", value: "YTD" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" }
] as const;

function resolveVariationBadge(variation: number): { value: string; variant: "positive" | "negative" | "neutral" } {
  if (!Number.isFinite(variation) || variation === 0) {
    return { value: "R$ 0", variant: "neutral" };
  }

  const prefix = variation > 0 ? "+" : "-";
  return {
    value: `${prefix}${formatBRLCompact(Math.abs(variation))}`,
    variant: variation > 0 ? "positive" : "negative"
  };
}

function dateToMonthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function NetWorthCard({
  valorTotal,
  variacao,
  isDataAvailable,
  activeFilter,
  onFilterChange,
  hrefVerTodas = "/net-worth",
  periodDescription,
  series
}: NetWorthCardProps): React.JSX.Element {
  const variationBadge = resolveVariationBadge(variacao);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Patrimonio</CardTitle>
          <p className="text-sm text-muted-foreground">Evolucao por faixa selecionada ({periodDescription}).</p>
        </div>
        <Link
          href={hrefVerTodas}
          className="text-sm font-semibold text-blue-500 transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Ver todas ↗
        </Link>
      </CardHeader>

      <CardContent className="flex h-full min-h-[320px] flex-col justify-between gap-6">
        <div className="space-y-2">
          <p className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{formatBRL(valorTotal)}</p>
          <Badge value={variationBadge.value} variant={variationBadge.variant} />
        </div>

        {isDataAvailable ? (
          <div className="h-[170px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatMonthLabel(dateToMonthKey(String(value)))}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  minTickGap={18}
                />
                <YAxis
                  tickFormatter={formatBRLCompact}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  content={
                    <DefaultChartTooltip
                      titleFormatter={(value) => formatMonthLabel(dateToMonthKey(String(value ?? "")))}
                    />
                  }
                />
                <Line type="monotone" dataKey="value" name="Patrimonio" stroke="#3b82f6" strokeWidth={2.4} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[170px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300/80 text-center text-muted-foreground dark:border-border">
            <Clock3 className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <p role="status">Dados disponiveis apos 7 dias</p>
            {/* TODO: ligar serie real de patrimonio por periodo assim que houver snapshots historicos suficientes. */}
          </div>
        )}

        <SegmentedControl
          options={filterOptions}
          value={activeFilter}
          onChange={(next) => onFilterChange?.(next)}
          ariaLabel="Selecionar intervalo de patrimonio"
        />
      </CardContent>
    </Card>
  );
}
