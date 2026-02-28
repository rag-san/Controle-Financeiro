import React from "react";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { DefaultChartTooltip } from "@/src/components/charts/DefaultChartTooltip";
import { Badge } from "@/src/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { formatBRL, formatBRLCompact, formatShortDate } from "@/src/utils/format";

type NetWorthPoint = {
  date: string;
  value: number;
};

interface NetWorthCardProps {
  valorTotal: number;
  variacao: number;
  isDataAvailable: boolean;
  hrefVerTodas?: string;
  hrefImportarExtrato?: string;
  periodDescription: string;
  series: NetWorthPoint[];
}

type ElementSize = {
  width: number;
  height: number;
};

function useElementSize<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  size: ElementSize;
} {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState<ElementSize>({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;

    const update = (): void => {
      if (!ref.current) return;
      const width = Math.floor(ref.current.clientWidth);
      const height = Math.floor(ref.current.clientHeight);
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    };

    update();

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    });

    observer.observe(node);
    window.addEventListener("resize", update);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  return { ref, size };
}

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

function formatDateLabel(dateIso: string): string {
  return formatShortDate(dateIso);
}

function resolveYAxisDomain(series: NetWorthPoint[]): [number, number] {
  const values = series
    .map((point) => Number(point.value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return [-1, 1];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const center = Number(min.toFixed(2));
    const padding = Math.max(Math.abs(center) * 0.025, 0.25);
    return [Number((center - padding).toFixed(2)), Number((center + padding).toFixed(2))];
  }

  const padding = Math.max((max - min) * 0.12, 0.05);
  return [Number((min - padding).toFixed(2)), Number((max + padding).toFixed(2))];
}

function resolveYAxisTicks(series: NetWorthPoint[]): number[] | undefined {
  const values = series
    .map((point) => Number(point.value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return [-0.1, 0, 0.1];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (Math.abs(max - min) < 0.01) {
    const center = Number(values[0].toFixed(2));
    return [center];
  }

  return undefined;
}

function resolveXAxisInterval(pointsLength: number, width: number): number {
  if (pointsLength <= 6) return 0;
  const safeWidth = Math.max(width, 320);
  const visibleLabels = Math.max(4, Math.floor(safeWidth / 82));
  return Math.max(0, Math.ceil(pointsLength / visibleLabels) - 1);
}

function isFlatSeries(series: NetWorthPoint[]): boolean {
  if (series.length < 2) return true;
  const first = Number(series[0]?.value ?? 0);
  return series.every((point) => Math.abs(Number(point.value) - first) < 0.01);
}

export function NetWorthCard({
  valorTotal,
  variacao,
  isDataAvailable,
  hrefVerTodas = "/net-worth",
  hrefImportarExtrato = "/transactions?import=1",
  periodDescription,
  series
}: NetWorthCardProps): React.JSX.Element {
  const variationBadge = resolveVariationBadge(variacao);
  const gradientId = "dashboard-net-worth-gradient";
  const chartContainer = useElementSize<HTMLDivElement>();
  const normalizedSeries = React.useMemo(
    () =>
      [...series]
        .filter((point) => Number.isFinite(Number(point.value)))
        .sort((left, right) => left.date.localeCompare(right.date)),
    [series]
  );
  const yDomain = React.useMemo(() => resolveYAxisDomain(normalizedSeries), [normalizedSeries]);
  const yTicks = React.useMemo(() => resolveYAxisTicks(normalizedSeries), [normalizedSeries]);
  const flatSeries = React.useMemo(() => isFlatSeries(normalizedSeries), [normalizedSeries]);
  const xAxisInterval = React.useMemo(
    () => resolveXAxisInterval(normalizedSeries.length, chartContainer.size.width),
    [normalizedSeries.length, chartContainer.size.width]
  );
  const canRenderChart = chartContainer.size.width > 0 && chartContainer.size.height > 0;

  return (
    <Card className="h-full overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/70 shadow-[0_10px_30px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/70">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-[11px] tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Patrimonio
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Evolucao por faixa selecionada ({periodDescription}).
          </p>
        </div>
        <Link
          href={hrefVerTodas}
          className="text-xs font-semibold text-sky-700 transition hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300 dark:hover:text-sky-200"
        >
          Ver mais ↗
        </Link>
      </CardHeader>

      <CardContent className="min-h-[320px] overflow-hidden">
        <div className="space-y-2.5">
          <p className="break-words text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {formatBRL(valorTotal)}
          </p>
          <div className="flex items-center gap-2">
            <Badge value={variationBadge.value} variant={variationBadge.variant} />
            <span className="text-xs text-slate-500 dark:text-slate-400">variacao na faixa</span>
          </div>
        </div>

        {isDataAvailable ? (
          <div
            ref={chartContainer.ref}
            className="relative mt-4 h-[190px] min-h-[190px] w-full min-w-0 rounded-xl border border-slate-200/80 bg-white/80 px-1 py-2 dark:border-slate-800 dark:bg-slate-950/60"
          >
            {canRenderChart ? (
              <AreaChart
                width={chartContainer.size.width}
                height={chartContainer.size.height}
                data={normalizedSeries}
                margin={{ top: 8, right: 16, left: 0, bottom: 6 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(100,116,139,0.2)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatDateLabel(String(value))}
                  tickLine={false}
                  axisLine={false}
                  interval={flatSeries ? Math.max(normalizedSeries.length - 2, 0) : xAxisInterval}
                  padding={{ left: 8, right: 8 }}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  minTickGap={18}
                />
                <YAxis
                  tickFormatter={flatSeries ? formatBRL : formatBRLCompact}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  tickCount={flatSeries ? 1 : 4}
                  domain={yDomain}
                  ticks={yTicks}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                {flatSeries ? (
                  <ReferenceLine y={Number(normalizedSeries[0]?.value ?? 0)} stroke="rgba(56,189,248,0.55)" strokeDasharray="3 3" />
                ) : null}
                <Tooltip
                  content={
                    <DefaultChartTooltip
                      titleFormatter={(value) => formatDateLabel(String(value ?? ""))}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Patrimonio"
                  stroke="hsl(var(--primary))"
                  fill={`url(#${gradientId})`}
                  strokeWidth={2.2}
                  strokeOpacity={flatSeries ? 0.8 : 1}
                  dot={false}
                />
              </AreaChart>
            ) : null}
            {flatSeries ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                  Sem variacao no periodo
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 flex h-[170px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300/80 px-4 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <Clock3 className="h-8 w-8" aria-hidden="true" />
            <p role="status">Dados disponiveis apos 7 dias</p>
            <Link
              href={hrefImportarExtrato}
              className="inline-flex h-8 items-center rounded-lg border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/60"
            >
              Adicionar transações
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
