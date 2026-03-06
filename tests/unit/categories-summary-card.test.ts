import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type CategoriesMonthSummaryCardComponent = (props: {
  totalSpent: number;
  monthDate: Date;
  slices: Array<{
    id: string;
    label: string;
    color: string;
    value: number;
    percentage: number;
  }>;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
}) => React.JSX.Element;

async function loadClientExport<T>(modulePath: string, exportName: string): Promise<T> {
  const moduleNamespace = await import(modulePath);
  const source = (moduleNamespace.default ?? moduleNamespace) as Record<string, unknown>;
  return source[exportName] as T;
}

test("categories summary card renders redesigned total, legend and month selector", async () => {
  const CategoriesMonthSummaryCard = await loadClientExport<CategoriesMonthSummaryCardComponent>(
    "../../src/features/categories/cards/CategoriesMonthSummaryCard.tsx",
    "CategoriesMonthSummaryCard"
  );

  const html = renderToStaticMarkup(
    React.createElement(CategoriesMonthSummaryCard, {
      totalSpent: 531.89,
      monthDate: new Date(Date.UTC(2026, 0, 15, 12, 0, 0)),
      slices: [
        { id: "1", label: "Assinaturas", color: "#ec4899", value: 63.83, percentage: 12 },
        { id: "2", label: "Seguros e Proteção", color: "#6366f1", value: 271.26, percentage: 51 },
        { id: "3", label: "Restaurantes", color: "#f59e0b", value: 74.46, percentage: 14 }
      ],
      onPreviousMonth: () => undefined,
      onNextMonth: () => undefined
    })
  );

  assert.match(html, /Total gasto/i);
  assert.match(html, /R\$\s*531,89/);
  assert.match(html, /Janeiro de 2026/);
  assert.match(html, /Assinaturas/);
  assert.match(html, /Seguros e Proteção/);
  assert.match(html, /12%/);
  assert.match(html, /51%/);
});

test("categories summary card renders explicit empty state when month has no spending", async () => {
  const CategoriesMonthSummaryCard = await loadClientExport<CategoriesMonthSummaryCardComponent>(
    "../../src/features/categories/cards/CategoriesMonthSummaryCard.tsx",
    "CategoriesMonthSummaryCard"
  );

  const html = renderToStaticMarkup(
    React.createElement(CategoriesMonthSummaryCard, {
      totalSpent: 0,
      monthDate: new Date(Date.UTC(2026, 1, 15, 12, 0, 0)),
      slices: [],
      onPreviousMonth: () => undefined,
      onNextMonth: () => undefined
    })
  );

  assert.match(html, /Sem gastos/i);
  assert.match(html, /Nenhum gasto classificado neste mês\./);
  assert.match(html, /Fevereiro de 2026/);
});

test("categories summary card keeps tiny real slices visible as less than one percent", async () => {
  const CategoriesMonthSummaryCard = await loadClientExport<CategoriesMonthSummaryCardComponent>(
    "../../src/features/categories/cards/CategoriesMonthSummaryCard.tsx",
    "CategoriesMonthSummaryCard"
  );

  const html = renderToStaticMarkup(
    React.createElement(CategoriesMonthSummaryCard, {
      totalSpent: 2484.42,
      monthDate: new Date(Date.UTC(2026, 0, 15, 12, 0, 0)),
      slices: [
        { id: "1", label: "Financiamentos e Consorcios", color: "#334155", value: 2037.22, percentage: 81.999 },
        { id: "2", label: "Transferencias", color: "#94a3b8", value: 173.91, percentage: 7.0 },
        { id: "3", label: "Sem categoria", color: "#d946ef", value: 3.72, percentage: 0.15 }
      ],
      onPreviousMonth: () => undefined,
      onNextMonth: () => undefined
    })
  );

  assert.match(html, /Sem categoria/);
  assert.match(html, /&lt;1%|<1%/);
});
