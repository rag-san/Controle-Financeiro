import { expect, test } from "@playwright/test";
import { buildCredentials, currencyPattern, registerAndLogin } from "./helpers";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildCurrentMonthImportCsv(accountName: string): Buffer {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const rows = [
    ["Date", "Description", "Amount", "Account", "ExternalId"],
    [`${year}-${month}-02`, "Salario Operacional QA", "6500.00", accountName, "e2e-ext-001"],
    [`${year}-${month}-04`, "Mercado Bairro QA", "-320.45", accountName, "e2e-ext-002"],
    [`${year}-${month}-05`, "Aluguel Escritorio QA", "-1800.00", accountName, "e2e-ext-003"],
    [`${year}-${month}-06`, "PIX Cliente QA", "900.00", accountName, "e2e-ext-004"],
    [`${year}-${month}-07`, "Farmacia Central QA", "-89.00", accountName, "e2e-ext-005"]
  ];

  return Buffer.from(rows.map((row) => row.join(",")).join("\n"), "utf8");
}

test("importacao de extrato cria conta, processa arquivo real e atualiza filtros com feedback visual", async ({
  page
}) => {
  test.slow();

  await registerAndLogin(page, buildCredentials("transactions"));
  await page.goto("/transactions?import=1");

  const importModal = page.getByTestId("import-transactions-modal");
  await expect(importModal).toBeVisible();

  await page.route("**/api/imports/parse", async (route) => {
    await wait(700);
    await route.continue();
  });

  await page.getByLabel("Selecionar arquivo para importacao").setInputFiles({
    name: "extrato-marco-e2e.csv",
    mimeType: "text/csv",
    buffer: buildCurrentMonthImportCsv("Conta Corrente QA")
  });

  await expect(page.getByTestId("import-file-selected-feedback")).toContainText("Arquivo selecionado");
  await page.getByRole("button", { name: "Analisar arquivo" }).click();
  await expect(page.getByRole("button", { name: "Analisando arquivo..." })).toBeVisible();

  await expect(importModal).toContainText("Resumo do arquivo");
  await expect(importModal).toContainText(/Linhas válidas:\s*5/);
  await expect(importModal).toContainText("Nenhuma conta cadastrada");

  await page.locator("#quick-account-name").fill("Conta Corrente QA");
  await page.locator("#quick-account-institution").fill("Banco QA");
  await page.locator("#quick-account-form button[type='submit']").click();

  await expect(page.locator("#import-default-account")).not.toHaveValue("");

  await page.getByRole("button", { name: "Importar 5 linhas" }).click();
  await expect(importModal).toBeHidden();

  const kpiSection = page.getByLabel("Resumo financeiro do período selecionado");
  await expect(page.getByTestId("transactions-table")).toContainText("Mercado Bairro QA");
  await expect(page.getByTestId("transactions-table")).toContainText("Salario Operacional QA");
  await expect(kpiSection).toContainText(currencyPattern(7400));
  await expect(kpiSection).toContainText(currencyPattern(2209.45));
  await expect(kpiSection).toContainText(currencyPattern(5190.55));

  await page.route("**/api/transactions?*", async (route) => {
    await wait(700);
    await route.continue();
  });

  await page.selectOption("#tx-filter-type", "expense");
  await expect(page.getByTestId("transactions-refresh-feedback")).toContainText(
    "Aplicando filtros e recalculando indicadores..."
  );
  await expect(page.getByTestId("transactions-table")).toContainText("Mercado Bairro QA");
  await expect(page.getByTestId("transactions-table")).not.toContainText("Salario Operacional QA");

  await page.getByLabel("Buscar transações").fill("nao-encontrada-e2e");
  await expect(page.getByTestId("transactions-refresh-feedback")).toContainText(
    "Aplicando filtros e recalculando indicadores..."
  );
  await expect(page.getByTestId("transactions-table-empty")).toBeVisible();
});
