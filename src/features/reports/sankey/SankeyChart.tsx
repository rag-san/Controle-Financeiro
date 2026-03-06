"use client";

import { useMemo } from "react";
import { useTheme } from "@/components/layout/ThemeProvider";
import type { SankeyLink, SankeyNode } from "@/src/features/reports/sankey/types";
import { formatBRL } from "@/src/utils/format";

type SankeyChartProps = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
};

type FlowNode = {
  id: string;
  label: string;
  color: string;
  value: number;
  dstHeight: number;
  dstTop: number;
};

type CenterNodeLayout = {
  id: string;
  label: string;
  value: number;
  color: string;
  top: number;
  height: number;
};

const CHART_W = 1280;
const CHART_H = 280;
const NODE_W = 12;
const LEFT_X = 74;
const CENTER_X = 370;
const RIGHT_X = 880;
const LEFT_NODE_H = 132;
const CENTER_TOTAL_H = 170;
const CENTER_GAP = 18;

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHeights(values: number[], totalHeight: number, minHeight: number): number[] {
  if (values.length === 0) return [];
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return values.map(() => minHeight);

  const proportional = values.map((value) => (value / sum) * totalHeight);
  const withMin = proportional.map((height) => Math.max(minHeight, height));
  const currentTotal = withMin.reduce((acc, height) => acc + height, 0);

  if (currentTotal <= totalHeight) {
    return withMin;
  }

  const flexibleIndexes = withMin
    .map((height, index) => ({ height, index }))
    .filter((item) => item.height > minHeight)
    .map((item) => item.index);

  if (flexibleIndexes.length === 0) {
    return withMin.map(() => totalHeight / withMin.length);
  }

  const overflow = currentTotal - totalHeight;
  const flexibleTotal = flexibleIndexes.reduce((acc, index) => acc + (withMin[index] - minHeight), 0);
  if (flexibleTotal <= 0) {
    return withMin;
  }

  return withMin.map((height, index) => {
    if (!flexibleIndexes.includes(index)) return height;
    const reducible = height - minHeight;
    const reduction = (reducible / flexibleTotal) * overflow;
    return Math.max(minHeight, height - reduction);
  });
}

function relaxLabelPositions(values: number[], minGap: number, minY: number, maxY: number): number[] {
  const positions = [...values];
  for (let pass = 0; pass < 24; pass += 1) {
    for (let index = 1; index < positions.length; index += 1) {
      const prev = positions[index - 1];
      const curr = positions[index];
      if (curr - prev < minGap) {
        const middle = (prev + curr) / 2;
        positions[index - 1] = middle - minGap / 2;
        positions[index] = middle + minGap / 2;
      }
    }
  }

  return positions.map((position) => clamp(minY, maxY, position));
}

function buildRibbonPath(
  srcRightX: number,
  dstLeftX: number,
  sourceTop: number,
  sourceBottom: number,
  targetTop: number,
  targetBottom: number
): string {
  const dx = dstLeftX - srcRightX;
  const controlA = srcRightX + dx * 0.48;
  const controlB = dstLeftX - dx * 0.48;

  return `M ${srcRightX} ${sourceTop}
    C ${controlA} ${sourceTop}, ${controlB} ${targetTop}, ${dstLeftX} ${targetTop}
    L ${dstLeftX} ${targetBottom}
    C ${controlB} ${targetBottom}, ${controlA} ${sourceBottom}, ${srcRightX} ${sourceBottom}
    Z`;
}

function splitLabel(label: string, maxCharsPerLine = 24, maxLines = 2): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["Categoria"];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxCharsPerLine));
      current = word.slice(maxCharsPerLine);
    }

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  const consumedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const remainingWords = words.slice(consumedWords);
  const finalLine = [current, ...remainingWords].filter(Boolean).join(" ").trim();

  if (finalLine) {
    lines.push(finalLine);
  }

  return lines.slice(0, maxLines).map((line, index) => {
    if (index === maxLines - 1 && lines.length > maxLines) {
      return `${line.slice(0, Math.max(1, maxCharsPerLine - 1)).trim()}…`;
    }
    if (line.length > maxCharsPerLine) {
      return `${line.slice(0, Math.max(1, maxCharsPerLine - 1)).trim()}…`;
    }
    return line;
  });
}

function CenterNode({
  layout,
  fg,
  sub
}: {
  layout: CenterNodeLayout;
  fg: string;
  sub: string;
}): React.JSX.Element {
  return (
    <g>
      <rect x={CENTER_X} y={layout.top} width={NODE_W} height={layout.height} rx={3} fill={layout.color} opacity={0.96} />
      <text x={CENTER_X + NODE_W + 12} y={layout.top + layout.height / 2 - 6} fill={fg} fontSize={12} fontWeight={700}>
        {layout.label}
      </text>
      <text x={CENTER_X + NODE_W + 12} y={layout.top + layout.height / 2 + 12} fill={sub} fontSize={10}>
        {formatBRL(layout.value)}
      </text>
    </g>
  );
}

export function SankeyChart({ nodes, links, totalIncome }: SankeyChartProps): React.JSX.Element {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const fg = dark ? "#f8fafc" : "#0f172a";
  const sub = dark ? "#a8b5c7" : "#64748b";
  const connector = dark ? "rgba(148,163,184,0.36)" : "rgba(100,116,139,0.34)";

  const incomeNode = nodes.find((node) => node.kind === "income");
  const expensesNode = nodes.find((node) => node.kind === "expenses");
  const savedNode = nodes.find((node) => node.kind === "saved");
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const expenseLinks = useMemo(
    () =>
      links
        .filter((link) => link.source === expensesNode?.id && link.value > 0)
        .sort((left, right) => right.value - left.value)
        .slice(0, 5),
    [expensesNode?.id, links]
  );

  if (!incomeNode || !expensesNode || expenseLinks.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-white/10">
        <p className="text-sm text-slate-400">Sem fluxo suficiente para renderizar o Sankey.</p>
      </div>
    );
  }

  const expenseValue = expenseLinks.reduce((acc, item) => acc + item.value, 0);
  const savedValue = Math.max(0, savedNode?.displayValue ?? links.find((link) => link.target === savedNode?.id)?.value ?? 0);

  const leftNodeY = (CHART_H - LEFT_NODE_H) / 2;
  const centerValues = savedValue > 0 ? [expenseValue, savedValue] : [expenseValue];
  const centerHeights = normalizeHeights(
    centerValues,
    CENTER_TOTAL_H - (centerValues.length - 1) * CENTER_GAP,
    26
  );
  const centerStartY = (CHART_H - CENTER_TOTAL_H) / 2;

  let centerCursor = centerStartY;
  const centerLayouts: CenterNodeLayout[] = [
    {
      id: expensesNode.id,
      label: "Despesas reais",
      value: expenseValue,
      color: expensesNode.color,
      top: centerCursor,
      height: centerHeights[0] ?? CENTER_TOTAL_H
    }
  ];
  centerCursor += (centerHeights[0] ?? CENTER_TOTAL_H) + CENTER_GAP;

  if (savedValue > 0 && savedNode) {
    centerLayouts.push({
      id: savedNode.id,
      label: "Economizado",
      value: savedValue,
      color: savedNode.color,
      top: centerCursor,
      height: centerHeights[1] ?? 32
    });
  }

  const centerById = new Map(centerLayouts.map((layout) => [layout.id, layout]));
  const incomeSegmentHeights = normalizeHeights(
    centerLayouts.map((item) => item.value),
    LEFT_NODE_H,
    14
  );
  let incomeCursor = leftNodeY;
  const incomeSegments = centerLayouts.map((layout, index) => {
    const segment = {
      targetId: layout.id,
      top: incomeCursor,
      height: incomeSegmentHeights[index] ?? 14
    };
    incomeCursor += segment.height;
    return segment;
  });

  const categoryHeights = normalizeHeights(
    expenseLinks.map((link) => link.value),
    CHART_H - 48 - (expenseLinks.length - 1) * 14,
    16
  );
  let categoryCursor = 24;
  const flowNodes: FlowNode[] = expenseLinks.map((link, index) => {
    const target = nodeById.get(link.target);
    const node: FlowNode = {
      id: link.target,
      label: target?.label ?? "Categoria",
      color: target?.color ?? link.color,
      value: link.value,
      dstHeight: categoryHeights[index] ?? 16,
      dstTop: categoryCursor
    };
    categoryCursor += node.dstHeight + 14;
    return node;
  });

  const rawLabelY = flowNodes.map((flow) => flow.dstTop + flow.dstHeight / 2);
  const labelY = relaxLabelPositions(rawLabelY, 24, 18, CHART_H - 18);

  return (
    <div className="w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block overflow-visible"
      >
        <rect x={LEFT_X} y={leftNodeY} width={NODE_W} height={LEFT_NODE_H} rx={3} fill={incomeNode.color} opacity={0.98} />
        <text x={LEFT_X - 10} y={CHART_H / 2 - 7} textAnchor="end" fill={fg} fontSize={12} fontWeight={700}>
          Receitas
        </text>
        <text x={LEFT_X - 10} y={CHART_H / 2 + 13} textAnchor="end" fill={sub} fontSize={10}>
          {formatBRL(totalIncome)}
        </text>

        {incomeSegments.map((segment) => {
          const target = centerById.get(segment.targetId);
          if (!target) return null;

          return (
            <path
              key={`income-${segment.targetId}`}
              d={buildRibbonPath(
                LEFT_X + NODE_W,
                CENTER_X,
                segment.top,
                segment.top + segment.height,
                target.top,
                target.top + target.height
              )}
              fill={target.color}
              opacity={segment.targetId === expensesNode.id ? 0.28 : 0.22}
            />
          );
        })}

        {centerLayouts.map((layout) => (
          <CenterNode key={layout.id} layout={layout} fg={fg} sub={sub} />
        ))}

        {flowNodes.map((flow, index) => {
          const expenseLayout = centerById.get(expensesNode.id);
          if (!expenseLayout) return null;

          const sourceHeights = normalizeHeights(
            flowNodes.map((item) => item.value),
            expenseLayout.height,
            12
          );
          const sourceTop = expenseLayout.top + sourceHeights.slice(0, index).reduce((sum, value) => sum + value, 0);
          const sourceBottom = sourceTop + (sourceHeights[index] ?? 12);
          const midY = flow.dstTop + flow.dstHeight / 2;
          const labelX = RIGHT_X + NODE_W + 10;
          const ly = labelY[index];
          const labelLines = splitLabel(flow.label, 28, 2);
          const labelStartY = ly - ((labelLines.length - 1) * 11) / 2;
          const valueY = labelStartY + labelLines.length * 11 + 4;

          return (
            <g key={flow.id}>
              <path
                d={buildRibbonPath(
                  CENTER_X + NODE_W,
                  RIGHT_X,
                  sourceTop,
                  sourceBottom,
                  flow.dstTop,
                  flow.dstTop + flow.dstHeight
                )}
                fill={flow.color}
                opacity={0.34}
              />
              <rect x={RIGHT_X} y={flow.dstTop} width={NODE_W} height={flow.dstHeight} rx={3} fill={flow.color} opacity={0.96} />
              {Math.abs(ly - midY) > 4 ? (
                <line x1={RIGHT_X + NODE_W} y1={midY} x2={labelX - 3} y2={ly} stroke={connector} strokeWidth={1.2} />
              ) : null}
              <text x={labelX} y={labelStartY} fill={fg} fontSize={11} fontWeight={700}>
                {labelLines.map((line, lineIndex) => (
                  <tspan key={`${flow.id}-${lineIndex}`} x={labelX} dy={lineIndex === 0 ? 0 : 11}>
                    {line}
                  </tspan>
                ))}
              </text>
              <text x={labelX} y={valueY} fill={sub} fontSize={9.4}>
                {formatBRL(flow.value)} · {((flow.value / Math.max(expenseValue, 1)) * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
