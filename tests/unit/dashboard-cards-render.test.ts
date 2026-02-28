import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type SpendingPaceCardComponent = (props: {
  paceDelta: number;
  variationPercent: number;
  previousExpense: number;
  chartData: Array<{ day: number; current: number; previous: number }>;
  currentLabel: string;
  previousLabel: string;
  periodDescription: string;
}) => React.JSX.Element;

type TopCategoriesCardComponent = (props: {
  categorias: Array<{
    categoryId: string;
    name: string;
    color: string;
    icon: string | null;
    current: number;
    previous: number;
    variation: number;
  }>;
  periodDescription: string;
}) => React.JSX.Element;

type NetWorthCardComponent = (props: {
  valorTotal: number;
  variacao: number;
  isDataAvailable: boolean;
  periodDescription: string;
  series: Array<{ date: string; value: number }>;
}) => React.JSX.Element;

type DashboardLoadingComponent = () => React.JSX.Element;

async function loadClientExport<T>(modulePath: string, exportName: string): Promise<T> {
  const moduleNamespace = await import(modulePath);
  const source = (moduleNamespace.default ?? moduleNamespace) as Record<string, unknown>;
  return source[exportName] as T;
}

function suppressResponsiveContainerWarnings(): () => void {
  const originalWarn = console.warn;
  const originalError = console.error;
  const shouldIgnore = (value: unknown): boolean =>
    typeof value === "string" && value.includes("The width(-1) and height(-1) of chart should be greater than 0");

  console.warn = (...args: unknown[]) => {
    if (args.some(shouldIgnore)) return;
    originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    if (args.some(shouldIgnore)) return;
    originalError(...args);
  };

  return () => {
    console.warn = originalWarn;
    console.error = originalError;
  };
}

function renderWithoutRechartsWarnings(element: React.ReactElement): string {
  const restore = suppressResponsiveContainerWarnings();
  try {
    return renderToStaticMarkup(element);
  } finally {
    restore();
  }
}

test("spending pace card renders empty state with no chart data", async () => {
  const SpendingPaceCard = await loadClientExport<SpendingPaceCardComponent>(
    "../../src/features/dashboard/cards/SpendingPaceCard.tsx",
    "SpendingPaceCard"
  );

  const html = renderToStaticMarkup(
    React.createElement(SpendingPaceCard, {
      paceDelta: 0,
      variationPercent: 0,
      previousExpense: 0,
      chartData: [{ day: 1, current: 0, previous: 0 }],
      currentLabel: "Periodo atual",
      previousLabel: "Periodo anterior",
      periodDescription: "mes atual"
    })
  );

  assert.match(html, /Dados disponiveis apos os primeiros lancamentos do periodo\./);
});

test("spending pace card renders chart flow with valid series", async () => {
  const SpendingPaceCard = await loadClientExport<SpendingPaceCardComponent>(
    "../../src/features/dashboard/cards/SpendingPaceCard.tsx",
    "SpendingPaceCard"
  );

  const html = renderWithoutRechartsWarnings(
    React.createElement(SpendingPaceCard, {
      paceDelta: 120,
      variationPercent: -10,
      previousExpense: 600,
      chartData: [
        { day: 1, current: 80, previous: 100 },
        { day: 2, current: 140, previous: 180 }
      ],
      currentLabel: "Periodo atual",
      previousLabel: "Periodo anterior",
      periodDescription: "01/02/2026 - 28/02/2026"
    })
  );

  assert.match(html, /Ritmo de gastos/);
  assert.doesNotMatch(html, /Dados disponiveis apos os primeiros lancamentos do periodo\./);
});

test("top categories card handles empty and populated states", async () => {
  const TopCategoriesCard = await loadClientExport<TopCategoriesCardComponent>(
    "../../src/features/dashboard/cards/TopCategoriesCard.tsx",
    "TopCategoriesCard"
  );

  const emptyHtml = renderToStaticMarkup(
    React.createElement(TopCategoriesCard, {
      categorias: [],
      periodDescription: "mes atual"
    })
  );
  assert.match(emptyHtml, /Sem categorias com gastos no periodo selecionado\./);

  const populatedHtml = renderToStaticMarkup(
    React.createElement(TopCategoriesCard, {
      categorias: [
        {
          categoryId: "cat-1",
          name: "Mercado",
          color: "#22c55e",
          icon: null,
          current: 320,
          previous: 300,
          variation: 6.67
        }
      ],
      periodDescription: "mes atual"
    })
  );
  assert.match(populatedHtml, /Mercado/);
});

test("net worth card renders fallback and chart states", async () => {
  const NetWorthCard = await loadClientExport<NetWorthCardComponent>(
    "../../src/features/dashboard/cards/NetWorthCard.tsx",
    "NetWorthCard"
  );

  const emptyHtml = renderToStaticMarkup(
    React.createElement(NetWorthCard, {
      valorTotal: 0,
      variacao: 0,
      isDataAvailable: false,
      periodDescription: "mes atual",
      series: []
    })
  );
  assert.match(emptyHtml, /Dados disponiveis apos 7 dias/);

  const chartHtml = renderWithoutRechartsWarnings(
    React.createElement(NetWorthCard, {
      valorTotal: 1500,
      variacao: 250,
      isDataAvailable: true,
      periodDescription: "mes atual",
      series: [
        { date: "2026-02-01", value: 1200 },
        { date: "2026-02-08", value: 1500 }
      ]
    })
  );
  assert.match(chartHtml, /Patrimonio/);
  assert.doesNotMatch(chartHtml, /Dados disponiveis apos 7 dias/);
});

test("dashboard loading skeleton renders without runtime errors", async () => {
  const DashboardLoading = await loadClientExport<DashboardLoadingComponent>(
    "../../src/features/dashboard/DashboardPage.tsx",
    "DashboardLoading"
  );

  const html = renderToStaticMarkup(React.createElement(DashboardLoading));
  assert.match(html, /animate-pulse/);
});
