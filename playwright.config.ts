import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3211);
const baseURL = `http://127.0.0.1:${port}`;

function resolveLocalBrowserExecutable(): string {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];

  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error(
      "Nenhum navegador Chromium local foi encontrado para os testes E2E. Instale Edge ou Chrome."
    );
  }

  return executablePath;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  outputDir: path.join("artifacts", "playwright", "test-results"),
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.join("artifacts", "playwright", "report")
      }
    ]
  ],
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: {
      width: 1440,
      height: 960
    },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: {
      executablePath: resolveLocalBrowserExecutable()
    }
  },
  webServer: {
    command:
      process.platform === "win32"
        ? `cmd /d /s /c "npm run dev:webpack -- --port ${port}"`
        : `npm run dev:webpack -- --port ${port}`,
    url: `${baseURL}/api/auth/session`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: "playwright-e2e-secret-change-me",
      API_PROFILING: "0"
    }
  }
});
