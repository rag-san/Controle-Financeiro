import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE_URL = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3100";
const LOGIN_EMAIL = process.env.VISUAL_LOGIN_EMAIL ?? "seed.reports@example.com";
const LOGIN_PASSWORD = process.env.VISUAL_LOGIN_PASSWORD ?? "Visual@123";
const RUN_TAG = process.env.VISUAL_RUN_TAG ?? "2026-02-23-designV2";
const OUT_DIR = path.join(process.cwd(), "docs", "visual-validation", RUN_TAG);

const CAPTURE_ROUTES = [
  { name: "dashboard", path: "/dashboard" },
  {
    name: "dashboard-notifications",
    path: "/dashboard",
    prepare: async (page) => {
      const bell = page.getByRole("button", { name: /Abrir notifica/i });
      if (await bell.count()) {
        await bell.first().click();
        await page.waitForTimeout(300);
      }
    }
  },
  { name: "transactions", path: "/transactions" },
  { name: "transactions-import-modal", path: "/transactions?import=1" },
  { name: "accounts", path: "/accounts" },
  {
    name: "accounts-connect-modal",
    path: "/accounts",
    prepare: async (page) => {
      const connectButtons = [
        page.getByRole("button", { name: "Conectar conta" }),
        page.getByRole("button", { name: "Conectar conta", exact: true })
      ];

      for (const candidate of connectButtons) {
        if (await candidate.count()) {
          await candidate.first().click();
          await page.waitForTimeout(300);
          return;
        }
      }
    }
  },
  { name: "cashflow", path: "/cashflow" },
  { name: "categories", path: "/categories" },
  { name: "net-worth", path: "/net-worth" },
  { name: "recurring", path: "/recurring" },
  { name: "reports", path: "/reports" },
  { name: "settings", path: "/settings" }
];

async function ensureDir(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#auth-email", { timeout: 20_000 });
  await page.fill("#auth-email", LOGIN_EMAIL);
  await page.fill("#auth-password", LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 25_000 });
  await page.waitForTimeout(450);
}

async function captureRoute(page, prefix, route) {
  await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(650);
  if (route.prepare) {
    await route.prepare(page);
  }
  await page.waitForTimeout(250);

  const fileName = `${prefix}-${route.name}.png`;
  const filePath = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function captureInContext(context, prefix) {
  const page = await context.newPage();
  const generated = [];
  await login(page);

  for (const route of CAPTURE_ROUTES) {
    const filePath = await captureRoute(page, prefix, route);
    generated.push(filePath);
  }

  await page.close();
  return generated;
}

async function run() {
  await ensureDir(OUT_DIR);

  const browser = await chromium.launch({ headless: true });

  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1536, height: 960 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo"
    });

    const mobileContext = await browser.newContext({
      ...devices["iPhone 13"],
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo"
    });

    const desktopShots = await captureInContext(desktopContext, "desktop");
    const mobileShots = await captureInContext(mobileContext, "mobile");

    await desktopContext.close();
    await mobileContext.close();

    const allShots = [...desktopShots, ...mobileShots];
    const report = [
      "# Visual Validation",
      "",
      `- Date: ${new Date().toISOString()}`,
      `- Base URL: ${BASE_URL}`,
      `- Run tag: ${RUN_TAG}`,
      "",
      "## Captured Files",
      ...allShots.map((item) => `- ${path.relative(process.cwd(), item).replaceAll("\\", "/")}`)
    ].join("\n");

    const reportPath = path.join(OUT_DIR, "REPORT.md");
    await fs.writeFile(reportPath, `${report}\n`, "utf8");

    console.log(`[visual-capture] screenshots=${allShots.length}`);
    console.log(`[visual-capture] report=${path.relative(process.cwd(), reportPath).replaceAll("\\", "/")}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`[visual-capture] FAIL: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
