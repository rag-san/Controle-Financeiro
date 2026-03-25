import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type TransactionsTableComponent = (props: {
  items: Array<{
    id: string;
    accountId: string;
    categoryId?: string | null;
    category?: { id: string; name: string; color: string; icon?: string | null; parentId?: string | null } | null;
    account?: { id: string; name: string; type: string; currency: string; institution?: string | null } | null;
    amount: number;
    date: string;
    description: string;
    type: "income" | "expense" | "transfer";
    status: "posted" | "pending";
  }>;
  categories: Array<{ id: string; name: string; color: string; icon?: string | null; parentId?: string | null }>;
  selectedIds: string[];
  suggestionsById: Map<string, unknown>;
  applyingSuggestionId?: string | null;
  loading?: boolean;
  sortField: "date" | "amount";
  sortDirection: "asc" | "desc";
  totalCount: number;
  visibleCount: number;
  onToggleSort: (field: "date" | "amount") => void;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onDelete: (id: string) => void;
  onClearFilters: () => void;
  onCreateTransaction?: () => void;
  onImportStatement?: () => void;
}) => React.JSX.Element;

type ResolveRefreshMessage = (input: {
  refreshing: boolean;
  page: number;
  debouncedQuery: string;
  filters: {
    accountId: string;
    categoryId: string;
    type: "" | "income" | "expense" | "transfer";
    period: "7d" | "30d" | "90d" | "this-month" | "last-month" | "custom" | "all";
  };
}) => string;

type ResolveRouteState = (
  searchParams: URLSearchParams,
  now?: Date
) => {
  period: {
    mode: string;
    label: string;
    from?: string;
    to?: string;
  };
  typeLabel: string;
  categoryId: string;
  uncategorizedOnly: boolean;
  accountId: string;
  excludedOnly: boolean;
  searchQuery: string;
};

async function loadClientExport<T>(modulePath: string, exportName: string): Promise<T> {
  const moduleNamespace = await import(modulePath);
  const source = (moduleNamespace.default ?? moduleNamespace) as Record<string, unknown>;
  return source[exportName] as T;
}

test("transactions refresh message explains the current refresh reason", async () => {
  const resolveTransactionsRefreshMessage = await loadClientExport<ResolveRefreshMessage>(
    "../../src/features/transactions/TransactionsPage.tsx",
    "resolveTransactionsRefreshMessage"
  );

  assert.equal(
    resolveTransactionsRefreshMessage({
      refreshing: true,
      page: 3,
      debouncedQuery: "",
      filters: {
        accountId: "",
        categoryId: "",
        type: "",
        period: "this-month"
      }
    }),
    "Atualizando transações e paginação..."
  );

  assert.equal(
    resolveTransactionsRefreshMessage({
      refreshing: true,
      page: 1,
      debouncedQuery: "mercado",
      filters: {
        accountId: "",
        categoryId: "",
        type: "",
        period: "this-month"
      }
    }),
    "Aplicando filtros e recalculando indicadores..."
  );

  assert.equal(
    resolveTransactionsRefreshMessage({
      refreshing: true,
      page: 1,
      debouncedQuery: "",
      filters: {
        accountId: "",
        categoryId: "",
        type: "",
        period: "this-month"
      }
    }),
    "Buscando transações e atualizando indicadores..."
  );

  assert.equal(
    resolveTransactionsRefreshMessage({
      refreshing: false,
      page: 1,
      debouncedQuery: "",
      filters: {
        accountId: "",
        categoryId: "",
        type: "",
        period: "this-month"
      }
    }),
    ""
  );
});

test("transactions route state respects shared query params from other pages", async () => {
  const resolveTransactionsRouteState = await loadClientExport<ResolveRouteState>(
    "../../src/features/transactions/TransactionsPage.tsx",
    "resolveTransactionsRouteState"
  );

  const state = resolveTransactionsRouteState(
    new URLSearchParams(
      "period=custom&from=2026-02-01&to=2026-02-28&type=expense&categoryId=cat-1&accountId=acc-1&excluded=true&q=mercado&category=uncategorized"
    ),
    new Date("2026-02-15T12:00:00.000Z")
  );

  assert.equal(state.period.mode, "custom");
  assert.equal(state.period.label, "Este mês");
  assert.equal(state.period.from, "2026-02-01");
  assert.equal(state.period.to, "2026-02-28");
  assert.equal(state.typeLabel, "Apenas Despesas");
  assert.equal(state.categoryId, "cat-1");
  assert.equal(state.accountId, "acc-1");
  assert.equal(state.excludedOnly, true);
  assert.equal(state.uncategorizedOnly, true);
  assert.equal(state.searchQuery, "mercado");
});

test("transactions table renders loading skeleton and empty state", async () => {
  const TransactionsTable = await loadClientExport<TransactionsTableComponent>(
    "../../src/features/transactions/components/TransactionsTable.tsx",
    "TransactionsTable"
  );

  const loadingHtml = renderToStaticMarkup(
    React.createElement(TransactionsTable, {
      items: [],
      categories: [],
      selectedIds: [],
      suggestionsById: new Map(),
      loading: true,
      sortField: "date",
      sortDirection: "desc",
      totalCount: 0,
      visibleCount: 0,
      onToggleSort: () => undefined,
      onToggleSelectAll: () => undefined,
      onToggleSelect: () => undefined,
      onCategoryChange: () => undefined,
      onDelete: () => undefined,
      onClearFilters: () => undefined
    })
  );
  assert.match(loadingHtml, /animate-pulse/);

  const emptyHtml = renderToStaticMarkup(
    React.createElement(TransactionsTable, {
      items: [],
      categories: [],
      selectedIds: [],
      suggestionsById: new Map(),
      loading: false,
      sortField: "date",
      sortDirection: "desc",
      totalCount: 0,
      visibleCount: 0,
      onToggleSort: () => undefined,
      onToggleSelectAll: () => undefined,
      onToggleSelect: () => undefined,
      onCategoryChange: () => undefined,
      onDelete: () => undefined,
      onClearFilters: () => undefined,
      onCreateTransaction: () => undefined,
      onImportStatement: () => undefined
    })
  );
  assert.match(emptyHtml, /Nenhuma transação encontrada/);
  assert.match(emptyHtml, /Limpar filtros/);
  assert.match(emptyHtml, /Importar extrato/);
});
