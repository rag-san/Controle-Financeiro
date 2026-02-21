"use client";

import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import type { ReportsSankeyLink, ReportsSankeyNode } from "@/src/features/reports/types";
import { formatBRL } from "@/src/utils/format";

type ReportsSankeyChartProps = {
  nodes: ReportsSankeyNode[];
  links: ReportsSankeyLink[];
};

type SankeyNodeRendererProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: {
    name?: string;
    color?: string;
    kind?: "income" | "balance" | "expense";
  };
};

type SankeyTooltipPayloadItem = TooltipPayloadEntry<number, string> & {
  payload?: {
    value?: number;
    source?: { name?: string };
    target?: { name?: string };
  };
};

function SankeyNodeRenderer({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  payload
}: SankeyNodeRendererProps): React.JSX.Element {
  const label = payload?.name ?? "";
  const fill = payload?.color ?? "#3b82f6";
  const textX = x + width + 8;
  const textY = y + height / 2;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={fill}
        fillOpacity={0.85}
        stroke="rgba(148, 163, 184, 0.45)"
      />
      <text
        x={textX}
        y={textY}
        textAnchor="start"
        dominantBaseline="middle"
        className="fill-slate-700 text-[12px] dark:fill-slate-300"
      >
        {label}
      </text>
    </g>
  );
}

function SankeyTooltip({
  active,
  payload
}: Partial<TooltipContentProps<number, string>>): React.JSX.Element | null {
  const typedPayload = payload as SankeyTooltipPayloadItem[] | undefined;
  const item = typedPayload?.[0];
  const linkPayload = item?.payload;

  if (!active || !linkPayload) {
    return null;
  }

  const sourceName = linkPayload.source?.name ?? "Origem";
  const targetName = linkPayload.target?.name ?? "Destino";
  const value = typeof linkPayload.value === "number" ? linkPayload.value : 0;

  return (
    <div className="min-w-[12rem] rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{sourceName} → {targetName}</p>
      <p className="mt-1 tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatBRL(value)}</p>
    </div>
  );
}

export function ReportsSankeyChart({ nodes, links }: ReportsSankeyChartProps): React.JSX.Element {
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links }}
          node={SankeyNodeRenderer}
          link={{ stroke: "rgba(148, 163, 184, 0.22)" }}
          nodePadding={28}
          nodeWidth={14}
          iterations={48}
          margin={{ top: 12, right: 40, bottom: 12, left: 12 }}
        >
          <Tooltip content={<SankeyTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
