import { expect, test } from "@playwright/test";
import { appJsonRequest, buildCredentials, currencyPattern, registerAndLogin } from "./helpers";

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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const createdCategoryResponse = await appJsonRequest<{ id: string }>(page, "/api/categories", {
    method: "POST",
    body: {
      name: "Categoria QA",
      color: "#3b82f6"
    }
  });
  expect(createdCategoryResponse.status).toBe(201);
  const createdCategory = createdCategoryResponse.payload;

  const parseRows = [
    {
      date: `${year}-${month}-02`,
      description: "Salario Operacional QA",
      amount: 6500,
      type: "income" as const,
      categoryId: createdCategory.id,
      accountHint: "Conta Corrente QA"
    },
    {
      date: `${year}-${month}-04`,
      description: "Mercado Bairro QA",
      amount: -320.45,
      type: "expense" as const,
      categoryId: createdCategory.id,
      accountHint: "Conta Corrente QA"
    },
    {
      date: `${year}-${month}-05`,
      description: "Aluguel Escritorio QA",
      amount: -1800,
      type: "expense" as const,
      categoryId: createdCategory.id,
      accountHint: "Conta Corrente QA"
    },
    {
      date: `${year}-${month}-06`,
      description: "PIX Cliente QA",
      amount: 900,
      type: "income" as const,
      categoryId: createdCategory.id,
      accountHint: "Conta Corrente QA"
    },
    {
      date: `${year}-${month}-07`,
      description: "Farmacia Central QA",
      amount: -89,
      type: "expense" as const,
      categoryId: createdCategory.id,
      accountHint: "Conta Corrente QA"
    }
  ];

  const parseResponse = {
    sourceType: "csv" as const,
    accountHint: "Conta Corrente QA",
    rows: parseRows,
    preview: parseRows.map((row, index) => ({
      commitIndex: index,
      status: "ok" as const,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      accountHint: row.accountHint
    })),
    needsMapping: false
  };

  await page.route("**/api/imports/parse", async (route) => {
    await wait(700);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(parseResponse)
    });
  });

  await page.goto("/transactions?import=1");

  await expect(page.getByRole("heading", { name: "Importar Extrato" })).toBeVisible();
  await expect(page.getByText("Adicione múltiplas transações de uma vez")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "extrato-marco-e2e.csv",
    mimeType: "text/csv",
    buffer: buildCurrentMonthImportCsv("Conta Corrente QA")
  });

  await expect(page.getByText("Analisando extrato...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar 5 transações" })).toBeVisible();

  const commitResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/imports/commit") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Criar Nova Conta" }).click();
  await page.getByPlaceholder("Nome da nova conta (Ex: Nubank Principal)").fill("Conta Corrente QA");

  await page.getByRole("button", { name: "Importar 5 transações" }).click();
  const commitResponse = await commitResponsePromise;
  expect(commitResponse.status()).toBe(201);
  const commitPayload = (await commitResponse.json()) as { totalImported?: number; warnings?: string[] };
  expect(commitPayload.totalImported).toBe(5);
  await expect(page.getByText("Importação Concluída!")).toBeVisible();
  await page.getByRole("button", { name: "Ver transações" }).click();
  await page.waitForURL("**/transactions");
  await page.goto("/transactions");

  const transactionsResponse = await appJsonRequest<{
    items: Array<{ description: string; amount: number }>;
    summary: { income: number; expense: number; balance: number };
  }>(page, "/api/transactions?period=all&page=1&pageSize=200&includeMeta=true&sort=date_desc"
  );
  expect(transactionsResponse.status).toBe(200);
  const transactionsPayload = transactionsResponse.payload;

  expect(transactionsPayload.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ description: "Mercado Bairro QA" }),
      expect.objectContaining({ description: "Salario Operacional QA" })
    ])
  );
  expect(transactionsPayload.summary.income).toBe(7400);
  expect(transactionsPayload.summary.expense).toBe(2209.45);
  expect(transactionsPayload.summary.balance).toBe(5190.55);

  await expect(page.getByText("Mercado Bairro QA")).toBeVisible();
  await expect(page.getByText("Salario Operacional QA")).toBeVisible();
  await expect(page.getByText(currencyPattern(7400))).toBeVisible();
  await expect(page.getByText(currencyPattern(2209.45))).toBeVisible();
  await expect(page.getByText(currencyPattern(5190.55))).toBeVisible();

  await page.getByPlaceholder("Buscar transações...").fill("nao-encontrada-e2e");
  await expect(page.getByText("Nenhuma transação encontrada.")).toBeVisible();
});
