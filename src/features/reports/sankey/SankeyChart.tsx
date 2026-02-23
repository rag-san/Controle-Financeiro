"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    source?: { kind?: string };
    target?: { kind?: string };
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
const COMPACT_LAYOUT_BREAKPOINT = 860;
const DENSE_LAYOUT_NODE_THRESHOLD = 16;
const DENSE_LAYOUT_LINK_THRESHOLD = 14;

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

function toLayoutData(
  nodes: SankeyNode[],
  links: SankeyLink[],
  simplifiedLayout: boolean,
  topCategoriesLimit: number
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  if (!simplifiedLayout) {
    return { nodes, links };
  }

  const expensesNodeId = nodes.find((node) => node.kind === "expenses")?.id ?? "expenses";
  const topCategoryIds = new Set(
    links
      .filter((link) => link.source === expensesNodeId)
      .sort((left, right) => right.value - left.value)
      .slice(0, topCategoriesLimit)
      .map((link) => link.target)
  );

  const allowedNodeIds = new Set(
    nodes
      .filter((node) => {
        if (node.kind === "subcategory") return false;
        if (node.kind !== "category") return true;
        return topCategoryIds.has(node.id) || node.label.toLowerCase().includes("outras");
      })
      .map((node) => node.id)
  );

  const filteredLinks = links.filter(
    (link) => allowedNodeIds.has(link.source) && allowedNodeIds.has(link.target)
  );
  const filteredNodes = nodes.filter((node) => allowedNodeIds.has(node.id));

  return {
    nodes: filteredNodes,
    links: filteredLinks
  };
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

export function SankeyChart({ nodes, links, totalIncome }: SankeyChartProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const compactLayout = containerWidth > 0 && containerWidth < COMPACT_LAYOUT_BREAKPOINT;
  const hasSubcategories = useMemo(
    () => nodes.some((node) => node.kind === "subcategory"),
    [nodes]
  );
  const simplifiedLayout =
    hasSubcategories &&
    (compactLayout || nodes.length > DENSE_LAYOUT_NODE_THRESHOLD || links.length > DENSE_LAYOUT_LINK_THRESHOLD);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const layoutData = useMemo(
    () => toLayoutData(nodes, links, simplifiedLayout, compactLayout ? 4 : 5),
    [compactLayout, links, nodes, simplifiedLayout]
  );
  const chartData = useMemo(
    () => toRechartsData(layoutData.nodes, layoutData.links),
    [layoutData.links, layoutData.nodes]
  );
  const maxLinkValue = useMemo(
    () => Math.max(1, ...chartData.links.map((link) => link.value)),
    [chartData.links]
  );
  const maxColumnNodes = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const node of layoutData.nodes) {
      counts[node.column] += 1;
    }
    return Math.max(1, ...counts);
  }, [layoutData.nodes]);

  const renderNode = (rawProps: unknown): React.JSX.Element => {
    const { x = 0, y = 0, width = 0, height = 0, payload } = rawProps as SankeyNodeRendererProps;
    const isRightSide = (payload?.column ?? 0) >= 2;
    const textX = isRightSide ? x - 7 : x + width + 7;
    const textAnchor = isRightSide ? "end" : "start";
    const textY = y + height / 2;
    const displayValue = payload?.displayValue ?? 0;
    const alwaysShowLabel =
      payload?.kind === "income" || payload?.kind === "expenses" || payload?.kind === "saved";
    const minLabelValue = totalIncome > 0 ? totalIncome * (compactLayout ? 0.06 : 0.025) : 0;
    const showLabel = height >= 12 && (alwaysShowLabel || displayValue >= minLabelValue);
    const showValue = !compactLayout && height >= 20 && (alwaysShowLabel || displayValue >= minLabelValue * 1.6);
    const label = truncateLabel(payload?.name ?? "", compactLayout ? 14 : 17);

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
        {showLabel ? (
          <text
            x={textX}
            y={showValue ? textY - 5 : textY}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            className="fill-slate-800 text-[12px] font-semibold dark:fill-slate-100"
            aria-hidden="true"
          >
            {label}
          </text>
        ) : null}
        {showValue ? (
          <text
            x={textX}
            y={textY + 9}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            className="fill-slate-700 text-[11px] font-medium tabular-nums dark:fill-slate-200"
            aria-hidden="true"
          >
            {formatBRL(displayValue)}
          </text>
        ) : null}
      </g>
    );
  };

  const heightPx = compactLayout
    ? clamp(280, 520, 200 + maxColumnNodes * 24)
    : simplifiedLayout
      ? clamp(300, 520, 180 + maxColumnNodes * 22)
      : clamp(320, 640, 190 + maxColumnNodes * 24);
  const desiredPadding =
    maxColumnNodes <= 2 ? 48 : maxColumnNodes <= 4 ? 24 : maxColumnNodes <= 7 ? 14 : 8;
  const maxSafePadding =
    maxColumnNodes > 1
      ? Math.floor((heightPx - 40 - maxColumnNodes * (compactLayout ? 10 : 12)) / (maxColumnNodes - 1))
      : 0;
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
    const stroke = props.payload?.color ?? "rgba(148, 163, 184, 0.26)";
    const realValue = Math.max(0, props.payload?.value ?? 0);
    const ratio = realValue / maxLinkValue;
    const easedRatio = Math.pow(ratio, 0.78);
    const minWidth = compactLayout ? 1.2 : MIN_LINK_WIDTH;
    const maxWidth = compactLayout ? 10 : MAX_LINK_WIDTH;
    const sourceKind = props.payload?.source?.kind;
    const targetKind = props.payload?.target?.kind;
    const isSavedFlow = sourceKind === "income" && targetKind === "saved";
    let strokeWidth = clamp(minWidth, maxWidth, minWidth + (maxWidth - minWidth) * easedRatio);
    if (isSavedFlow) {
      strokeWidth = Math.min(strokeWidth, compactLayout ? 3.8 : 5.2);
    }
    const isMinorFlow = ratio < 0.08;
    const baseOpacity = isSavedFlow ? 0.24 : isMinorFlow ? 0.34 : 0.55;
    const strokeOpacity = hoveredLink === null ? baseOpacity : hoveredLink === index ? 0.8 : 0.22;

    const path = `M${sourceX},${sourceY}
      C${sourceControlX},${sourceY}
      ${targetControlX},${targetY}
      ${targetX},${targetY}`;

    return (
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeDasharray={isSavedFlow ? "4 3" : undefined}
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
        onMouseEnter={() => setHoveredLink(index)}
        onMouseLeave={() => setHoveredLink(null)}
      />
    );
  };

  return (
    <div ref={containerRef} className="w-full" style={{ height: `${heightPx}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={chartData}
          node={renderNode}
          link={renderLink}
          nodePadding={nodePadding}
          nodeWidth={compactLayout ? 8 : 9}
          iterations={64}
          margin={compactLayout ? { top: 16, right: 60, bottom: 16, left: 60 } : { top: 20, right: 92, bottom: 20, left: 92 }}
        >
          <Tooltip content={<SankeyTooltip totalIncome={totalIncome} />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
