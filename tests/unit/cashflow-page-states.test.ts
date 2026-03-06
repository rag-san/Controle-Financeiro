import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type CashflowLoadingComponent = () => React.JSX.Element;
type CashflowErrorStateComponent = (props: { message?: string }) => React.JSX.Element;

async function loadClientExport<T>(modulePath: string, exportName: string): Promise<T> {
  const moduleNamespace = await import(modulePath);
  const source = (moduleNamespace.default ?? moduleNamespace) as Record<string, unknown>;
  return source[exportName] as T;
}

test("cashflow loading skeleton renders without runtime errors", async () => {
  const CashflowLoading = await loadClientExport<CashflowLoadingComponent>(
    "../../src/features/cashflow/CashflowPage.tsx",
    "CashflowLoading"
  );

  const html = renderToStaticMarkup(React.createElement(CashflowLoading));
  assert.match(html, /animate-pulse/);
});

test("cashflow error state renders explicit feedback message", async () => {
  const CashflowErrorState = await loadClientExport<CashflowErrorStateComponent>(
    "../../src/features/cashflow/CashflowPage.tsx",
    "CashflowErrorState"
  );

  const html = renderToStaticMarkup(
    React.createElement(CashflowErrorState, {
      message: "Falha ao atualizar gráficos."
    })
  );

  assert.match(html, /Falha ao atualizar gráficos\./);
  assert.match(html, /feedback-message--error/);
});
