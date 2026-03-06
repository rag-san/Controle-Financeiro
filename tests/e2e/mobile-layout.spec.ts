import { expect, test, type Page } from "@playwright/test";
import {
  buildCredentials,
  buildMonthDate,
  createAccount,
  createCategory,
  createTransaction,
  registerAndLogin
} from "./helpers";

const breakpoints = [
  { name: "320", width: 320, height: 720 },
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "412", width: 412, height: 915 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 960 }
] as const;

const primaryRoutes = [
  "/dashboard",
  "/transactions",
  "/cashflow",
  "/reports",
  "/categories",
  "/accounts",
  "/net-worth",
  "/recurring",
  "/review"
] as const;

async function assertNoHorizontalPageOverflow(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toBeVisible();

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
    return scrollWidth - doc.clientWidth;
  });

  expect(overflow, `overflow horizontal inesperado em ${route}`).toBeLessThanOrEqual(1);
}

test("layout principal mantém navegação e páginas estáveis em múltiplos breakpoints", async ({
  page
}) => {
  test.slow();

  await registerAndLogin(page, buildCredentials("mobile-layout"));

  const checkingAccount = await createAccount(page, {
    name: "Conta Mobile QA",
    type: "checking"
  });
  const groceriesCategory = await createCategory(page, { name: "Mercado Mobile QA", color: "#22c55e" });
  const transportCategory = await createCategory(page, { name: "Transporte Mobile QA", color: "#0ea5e9" });

  await createTransaction(page, {
    accountId: checkingAccount.id,
    date: buildMonthDate(2),
    description: "Salário Mobile QA",
    amount: 5400,
    type: "income"
  });
  await createTransaction(page, {
    accountId: checkingAccount.id,
    categoryId: groceriesCategory.id,
    date: buildMonthDate(4),
    description: "Supermercado Mobile QA",
    amount: -312.48,
    type: "expense"
  });
  await createTransaction(page, {
    accountId: checkingAccount.id,
    categoryId: transportCategory.id,
    date: buildMonthDate(6),
    description: "Transporte Mobile QA",
    amount: -88.9,
    type: "expense"
  });

  for (const breakpoint of breakpoints) {
    await test.step(`validar ${breakpoint.name}`, async () => {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });

      for (const route of primaryRoutes) {
        await assertNoHorizontalPageOverflow(page, route);
      }
    });
  }
});

test("mobile mantém drawer de navegação e modal fullscreen utilizáveis", async ({ page }) => {
  await registerAndLogin(page, buildCredentials("mobile-nav"));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  await expect(page.getByRole("button", { name: "Abrir menu lateral" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu lateral" }).click();
  await expect(page.getByText("Menu")).toBeVisible();
  await page.getByRole("button", { name: "Fechar menu lateral" }).click();
  await expect(page.getByText("Menu")).not.toBeVisible();

  await page.goto("/categories");
  await page.getByRole("button", { name: /Nova Categoria/i }).click();

  const dialog = page.getByRole("dialog", { name: /Nova categoria/i });
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 0).toBeGreaterThan(780);
  expect(box?.width ?? 0).toBeGreaterThan(360);

  await page.getByRole("button", { name: /Cancelar/i }).click();
  await expect(dialog).not.toBeVisible();
});
