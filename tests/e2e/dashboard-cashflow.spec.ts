import { expect, test } from "@playwright/test";
import {
  buildCredentials,
  buildMonthDate,
  buildNextMonthRange,
  createAccount,
  createCategory,
  createTransaction,
  currencyPattern,
  registerAndLogin
} from "./helpers";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

test("dashboard mostra dados reais e reage ao filtro por periodo", async ({ page }) => {
  test.slow();

  await registerAndLogin(page, buildCredentials("dashboard"));

  const checkingAccount = await createAccount(page, {
    name: "Conta Operacional QA",
    type: "checking"
  });
  const marketCategory = await createCategory(page, { name: "Mercado QA", color: "#22c55e" });
  const pharmacyCategory = await createCategory(page, { name: "Farmacia QA", color: "#f97316" });

  await createTransaction(page, {
    accountId: checkingAccount.id,
    date: buildMonthDate(1),
    description: "Salario operacional QA",
    amount: 7800,
    type: "income"
  });
  await createTransaction(page, {
    accountId: checkingAccount.id,
    categoryId: marketCategory.id,
    date: buildMonthDate(3),
    description: "Mercado QA",
    amount: -620.45,
    type: "expense"
  });
  await createTransaction(page, {
    accountId: checkingAccount.id,
    categoryId: pharmacyCategory.id,
    date: buildMonthDate(4),
    description: "Farmacia QA",
    amount: -89.9,
    type: "expense"
  });

  await page.route("**/api/dashboard/overview?*", async (route) => {
    await wait(700);
    await route.continue();
  });

  await page.goto("/dashboard");

  await expect(page.getByTestId("dashboard-loading")).toBeVisible();

  const resultCard = page.getByTestId("dashboard-partial-result-card");
  await expect(resultCard).toBeVisible();
  await expect(resultCard).toContainText(currencyPattern(7089.65));
  await expect(resultCard).toContainText(currencyPattern(7800));
  await expect(resultCard).toContainText(currencyPattern(710.35));

  await expect(page.getByTestId("dashboard-top-categories-card")).toContainText("Mercado QA");
  await expect(page.getByTestId("dashboard-net-worth-card")).toContainText(currencyPattern(7089.65));

  const nextRange = buildNextMonthRange();
  await page.getByRole("button", { name: /Filtros|Filtro:/i }).click();
  await page.locator("#dashboard-filter-from").fill(nextRange.from);
  await page.locator("#dashboard-filter-to").fill(nextRange.to);
  await page.getByRole("button", { name: "Aplicar" }).click();

  await expect(page.getByTestId("dashboard-top-categories-card")).toContainText(
    `${formatDisplayDate(nextRange.from)} - ${formatDisplayDate(nextRange.to)}`
  );
  await expect(page.getByTestId("dashboard-top-categories-card")).toContainText(currencyPattern(0));
  await expect(page.getByTestId("dashboard-partial-result-card")).toContainText(currencyPattern(0));
});

test("cashflow mostra loading, dados reais e feedback de erro quando a consulta falha", async ({
  page
}) => {
  test.slow();

  await registerAndLogin(page, buildCredentials("cashflow"));

  await page.route("**/api/metrics/official?view=cashflow*", async (route) => {
    const url = new URL(route.request().url());
    const period = url.searchParams.get("period");

    if (period === "1m") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha controlada do fluxo de caixa E2E." })
      });
      return;
    }

    await wait(700);
    await route.continue();
  });

  await page.goto("/cashflow");

  await expect(page.getByTestId("cashflow-loading")).toBeVisible();
  await expect(page.getByTestId("cashflow-net-result-card")).toBeVisible();
  await expect(page.getByTestId("cashflow-expenses-card")).toBeVisible();
  await expect(page.getByTestId("cashflow-income-card")).toBeVisible();

  await page.getByRole("button", { name: "1 mes" }).click();

  await expect(page.getByTestId("cashflow-error")).toContainText(
    "Falha controlada do fluxo de caixa E2E."
  );
});
