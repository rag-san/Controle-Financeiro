import { expect, type Page } from "@playwright/test";

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

type ApiResponse<T> = {
  status: number;
  payload: T;
};

export type E2ECredentials = {
  name: string;
  email: string;
  password: string;
};

export type CreatedAccount = {
  id: string;
  name: string;
  type: "checking" | "credit" | "cash" | "investment";
  parentAccountId?: string | null;
};

export type CreatedCategory = {
  id: string;
  name: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildCredentials(prefix = "e2e"): E2ECredentials {
  const uniqueToken = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  return {
    name: `Usuario ${prefix}`,
    email: `${prefix}.${uniqueToken}@example.com`,
    password: "StrongPass!123"
  };
}

export function currencyPattern(value: number): RegExp {
  const normalized = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value));

  return new RegExp(escapeRegExp(normalized));
}

export function buildMonthDate(day: number, monthOffset = 0): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, day);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const date = String(target.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

export function buildNextMonthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const format = (value: Date): string => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const date = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${date}`;
  };

  return {
    from: format(start),
    to: format(end)
  };
}

export async function registerAndLogin(
  page: Page,
  credentials: E2ECredentials = buildCredentials()
): Promise<E2ECredentials> {
  await page.goto("/login");
  await page.getByRole("button", { name: /Criar agora/i }).click();
  await expect(page.locator("#auth-name")).toBeVisible();
  await page.locator("#auth-name").fill(credentials.name);
  await page.locator("#auth-email").fill(credentials.email);
  await page.locator("#auth-password").fill(credentials.password);
  await page.locator("#auth-confirm-password").fill(credentials.password);

  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: /^Criar conta$/ }).click()
  ]);

  await expect(page).toHaveURL(/\/dashboard/);
  return credentials;
}

export async function appJsonRequest<T>(
  page: Page,
  routePath: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  return page.evaluate(
    async ({ routePath: path, options: requestOptions }) => {
      const method = requestOptions.method ?? "GET";
      const headers = new Headers(requestOptions.headers ?? {});
      let body: string | undefined;

      if (requestOptions.body !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(requestOptions.body);
      }

      const response = await fetch(path, {
        method,
        headers,
        body
      });

      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      return {
        status: response.status,
        payload
      };
    },
    { routePath, options }
  );
}

export async function createAccount(
  page: Page,
  input: {
    name: string;
    type: CreatedAccount["type"];
    institution?: string;
    currency?: string;
    parentAccountId?: string | null;
  }
): Promise<CreatedAccount> {
  const response = await appJsonRequest<CreatedAccount | { error?: unknown }>(page, "/api/accounts", {
    method: "POST",
    body: {
      name: input.name,
      type: input.type,
      institution: input.institution ?? "Banco QA",
      currency: input.currency ?? "BRL",
      parentAccountId: input.parentAccountId ?? null
    }
  });

  expect(response.status).toBe(201);
  expect(response.payload).toHaveProperty("id");
  return response.payload as CreatedAccount;
}

export async function createCategory(
  page: Page,
  input: {
    name: string;
    color?: string;
    icon?: string;
  }
): Promise<CreatedCategory> {
  const response = await appJsonRequest<CreatedCategory | { error?: unknown }>(page, "/api/categories", {
    method: "POST",
    body: {
      name: input.name,
      color: input.color ?? "#22c55e",
      icon: input.icon ?? "Tag"
    }
  });

  expect(response.status).toBe(201);
  expect(response.payload).toHaveProperty("id");
  return response.payload as CreatedCategory;
}

export async function createTransaction(
  page: Page,
  input: {
    accountId: string;
    categoryId?: string | null;
    date: string;
    description: string;
    amount: number;
    type: "income" | "expense";
    excluded?: boolean;
    status?: "posted" | "pending";
  }
): Promise<void> {
  const response = await appJsonRequest<{ id: string } | { error?: unknown }>(page, "/api/transactions", {
    method: "POST",
    body: {
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      date: input.date,
      description: input.description,
      amount: input.amount,
      type: input.type,
      excluded: input.excluded ?? false,
      status: input.status ?? "posted"
    }
  });

  expect(response.status).toBe(201);
  expect(response.payload).toHaveProperty("id");
}
