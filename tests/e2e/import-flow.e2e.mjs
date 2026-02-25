import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const port = Number(process.env.E2E_PORT ?? 3230);
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePath = path.join(repoRoot, "tests", "fixtures", "import-transactions.csv");
const testDbRelativePath = path.join("data", "finance.e2e.db");
const testDbPath = path.join(repoRoot, testDbRelativePath);
const bootTimeoutMs = 120_000;

let serverProcess = null;
const serverLogs = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTestDbFiles() {
  const suffixes = ["", "-shm", "-wal"];
  for (const suffix of suffixes) {
    await fs.rm(`${testDbPath}${suffix}`, { force: true }).catch(() => undefined);
  }
}

async function waitForServerReady() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < bootTimeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/session`, {
        signal: AbortSignal.timeout(5_000)
      });
      if (response.status === 200) {
        return;
      }
    } catch {
      // no-op while server boots
    }
    await sleep(700);
  }

  throw new Error(`Servidor de teste nao inicializou em ${bootTimeoutMs}ms.\n${serverLogs.join("")}`);
}

async function startServer() {
  console.log("[e2e:import] starting server");
  const isWindows = process.platform === "win32";
  const npmCommand = isWindows ? "cmd.exe" : "npm";
  const npmArgs = isWindows
    ? ["/d", "/s", "/c", `npm run dev:webpack -- --port ${port}`]
    : ["run", "dev:webpack", "--", "--port", String(port)];

  serverProcess = spawn(npmCommand, npmArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXTAUTH_URL: baseUrl,
      NEXTAUTH_SECRET: "e2e-import-flow-secret",
      FINANCE_DB_PATH: testDbRelativePath,
      API_PROFILING: "0"
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  serverProcess.stdout.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
  });

  await waitForServerReady();
  console.log("[e2e:import] server ready");
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  const waitForExit = async () =>
    Promise.race([
      once(serverProcess, "exit"),
      sleep(10_000).then(() => {
        throw new Error("timeout waiting server process to exit");
      })
    ]).catch(() => undefined);

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore" });
    await waitForExit();
    return;
  }

  serverProcess.kill("SIGTERM");
  await waitForExit();
}

async function registerUser(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "E2E Import User",
      email,
      password,
      confirmPassword: password
    })
  });

  assert.equal(response.status, 201);
}

async function loginInBrowserContext(context, email, password) {
  const csrfResponse = await context.request.get(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrfResponse.status(), 200);
  const csrfPayload = await csrfResponse.json();
  const csrfToken = csrfPayload?.csrfToken;
  assert.equal(typeof csrfToken, "string");

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true"
  });

  const loginResponse = await context.request.post(`${baseUrl}/api/auth/callback/credentials?json=true`, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    data: body.toString()
  });

  assert.ok([200, 302].includes(loginResponse.status()));
}

async function run() {
  console.log("[e2e:import] bootstrap");
  await removeTestDbFiles();
  await startServer();

  const uniqueToken = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `e2e.import.${uniqueToken}@example.com`;
  const password = "StrongPass!123";

  try {
    console.log("[e2e:import] register user");
    await registerUser(email, password);

    console.log("[e2e:import] launch browser");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo"
    });
    const page = await context.newPage();

    console.log("[e2e:import] authenticate via API");
    await loginInBrowserContext(context, email, password);

    console.log("[e2e:import] create account");
    const createAccountResponse = await context.request.post(`${baseUrl}/api/accounts`, {
      data: {
        name: "Conta Corrente E2E",
        type: "checking",
        institution: "E2E Bank",
        currency: "BRL"
      }
    });
    assert.equal(createAccountResponse.status(), 201);

    console.log("[e2e:import] import flow");
    await page.goto(`${baseUrl}/transactions?import=1`, { waitUntil: "domcontentloaded" });
    await page.getByRole("dialog", { name: "Importação de arquivo" }).waitFor({ timeout: 30_000 });

    await page.setInputFiles("#import-file-input", fixturePath);
    await page.getByRole("button", { name: "Analisar arquivo" }).click();
    await page.getByText("Preview da importacao").waitFor({ timeout: 20_000 });

    const importButton = page.getByRole("button", { name: /Importar \d+ linha/ });
    await importButton.waitFor({ state: "visible", timeout: 20_000 });
    await importButton.click();

    await page.getByRole("dialog", { name: "Importação de arquivo" }).waitFor({ state: "hidden", timeout: 25_000 });
    await page.getByText("Compra Farmacia").waitFor({ timeout: 30_000 });

    const currentUrl = page.url();
    assert.ok(!currentUrl.includes("import=1"), "Modal deveria fechar removendo o query param import=1.");

    console.log("[e2e:import] done");
    await browser.close();
    console.log("[e2e:import] PASS");
  } finally {
    await stopServer();
    await removeTestDbFiles();
  }
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[e2e:import] FAIL: ${message}`);
  await stopServer().catch(() => undefined);
  await removeTestDbFiles().catch(() => undefined);
  process.exitCode = 1;
});
