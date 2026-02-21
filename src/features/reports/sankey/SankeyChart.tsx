"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import type { SankeyLink, SankeyNode } from "@/src/features/reports/sankey/types";
import { formatBRL } from "@/src/utils/format";

type SankeyChartProps = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
};

type RechartsNode = SankeyNode & {
  name: string;
};

type RechartsLink = {
  source: number;
  target: number;
  value: number;
  color: string;
};

type SankeyNodeRendererProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: RechartsNode;
};

type SankeyLinkRendererProps = {
  index?: number;
  sourceX?: number;
  targetX?: number;
  sourceY?: number;
  targetY?: number;
  sourceControlX?: number;
  targetControlX?: number;
  linkWidth?: number;
  payload?: {
    color?: string;
    value?: number;
  };
};

type SankeyTooltipPayloadItem = TooltipPayloadEntry<number, string> & {
  payload?: {
    value?: number;
    name?: string;
    source?: { name?: string };
    target?: { name?: string };
  };
};

const MIN_LINK_WIDTH = 1.5;
const MAX_LINK_WIDTH = 14;

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncateLabel(label: string, max = 17): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function toRechartsData(nodes: SankeyNode[], links: SankeyLink[]): { nodes: RechartsNode[]; links: RechartsLink[] } {
  const rechartsNodes: RechartsNode[] = nodes.map((node) => ({
    ...node,
    name: node.label
  }));

  const nodeIndexById = new Map(rechartsNodes.map((node, index) => [node.id, index]));
  const rechartsLinks: RechartsLink[] = [];

  for (const link of links) {
    const source = nodeIndexById.get(link.source);
    const target = nodeIndexById.get(link.target);
    if (source === undefined || target === undefined) continue;
    if (!Number.isFinite(link.value) || link.value <= 0) continue;
    rechartsLinks.push({
      source,
      target,
      value: link.value,
      color: link.color
    });
  }

  return { nodes: rechartsNodes, links: rechartsLinks };
}

function SankeyTooltip({
  active,
  payload,
  totalIncome
}: Partial<TooltipContentProps<number, string>> & { totalIncome: number }): React.JSX.Element | null {
  const typedPayload = payload as SankeyTooltipPayloadItem[] | undefined;
  const item = typedPayload?.[0];
  const data = item?.payload;

  if (!active || !data) return null;

  const value = typeof data.value === "number" ? data.value : 0;
  const hasLink = Boolean(data.source?.name || data.target?.name);
  const title = hasLink
    ? `${data.source?.name ?? "Origem"} → ${data.target?.name ?? "Destino"}`
    : (data.name ?? "Fluxo");
  const percent = totalIncome > 0 ? (value / totalIncome) * 100 : 0;

  return (
    <div className="min-w-[14rem] rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-1 tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatBRL(value)}</p>
      {totalIncome > 0 ? (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{percent.toFixed(1)}% da receita</p>
      ) : null}
    </div>
  );
}

function renderNode(rawProps: unknown): React.JSX.Element {
  const { x = 0, y = 0, width = 0, height = 0, payload } = rawProps as SankeyNodeRendererProps;
  const isRightSide = (payload?.column ?? 0) >= 2;
  const textX = isRightSide ? x - 6 : x + width + 6;
  const textAnchor = isRightSide ? "end" : "start";
  const textY = y + height / 2;
  const label = truncateLabel(payload?.name ?? "");

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={payload?.color ?? "#3b82f6"}
        fillOpacity={0.95}
        stroke="rgba(148, 163, 184, 0.28)"
      />
      <text
        x={textX}
        y={textY - 6}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        className="fill-slate-800 text-[13px] font-semibold dark:fill-slate-100"
        aria-hidden="true"
      >
        {label}
      </text>
      <text
        x={textX}
        y={textY + 9}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        className="fill-slate-800 text-[12px] font-medium tabular-nums dark:fill-slate-100"
        aria-hidden="true"
      >
        {formatBRL(payload?.displayValue ?? 0)}
      </text>
    </g>
  );
}

export function SankeyChart({ nodes, links, totalIncome }: SankeyChartProps): React.JSX.Element {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const chartData = useMemo(() => toRechartsData(nodes, links), [links, nodes]);
  const maxColumnNodes = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const node of nodes) {
      counts[node.column] += 1;
    }
    return Math.max(1, ...counts);
  }, [nodes]);

  const heightPx = clamp(260, 340, 180 + maxColumnNodes * 16);
  const desiredPadding =
    maxColumnNodes <= 2
      ? 170
      : maxColumnNodes === 3
        ? 80
        : maxColumnNodes <= 5
          ? 36
          : 16;
  const maxSafePadding =
    maxColumnNodes > 1 ? Math.floor((heightPx - 60) / (maxColumnNodes - 1)) : 0;
  const nodePadding =
    maxColumnNodes > 1
      ? Math.max(6, Math.min(desiredPadding, maxSafePadding))
      : 16;

  const renderLink = (rawProps: unknown): React.JSX.Element => {
    const props = rawProps as SankeyLinkRendererProps;
    const index = props.index ?? 0;
    const sourceX = props.sourceX ?? 0;
    const targetX = props.targetX ?? 0;
    const sourceY = props.sourceY ?? 0;
    const targetY = props.targetY ?? 0;
    const sourceControlX = props.sourceControlX ?? sourceX;
    const targetControlX = props.targetControlX ?? targetX;
    const linkWidth = props.linkWidth ?? 0;
    const stroke = props.payload?.color ?? "rgba(148, 163, 184, 0.26)";
    const realValue = props.payload?.value ?? linkWidth;
    const scaledWidth = Math.sqrt(Math.max(0, realValue)) * 0.6;
    const strokeWidth = Math.max(MIN_LINK_WIDTH, Math.min(MAX_LINK_WIDTH, scaledWidth));
    const strokeOpacity = hoveredLink === null ? 0.52 : hoveredLink === index ? 0.78 : 0.28;

    const path = `M${sourceX},${sourceY}
      C${sourceControlX},${sourceY}
      ${targetControlX},${targetY}
      ${targetX},${targetY}`;

    return (
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
        onMouseEnter={() => setHoveredLink(index)}
        onMouseLeave={() => setHoveredLink(null)}
      />
    );
  };

  return (
    <div className="w-full" style={{ height: `${heightPx}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={chartData}
          node={renderNode}
          link={renderLink}
          nodePadding={nodePadding}
          nodeWidth={9}
          iterations={56}
          margin={{ top: 20, right: 92, bottom: 20, left: 92 }}
        >
          <Tooltip content={<SankeyTooltip totalIncome={totalIncome} />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
