import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("page container keeps responsive paddings as mobile baseline", () => {
  const pageContainer = readRepoFile("components/layout/PageContainer.tsx");

  assert.ok(
    pageContainer.includes('"px-4 py-5 md:px-6 md:py-6 xl:px-8"'),
    "PageContainer responsive spacing contract changed."
  );
});

test("page shell keeps global x-overflow guards for all app screens", () => {
  const pageShell = readRepoFile("components/layout/PageShell.tsx");

  assert.ok(
    pageShell.includes('className="min-h-screen overflow-x-hidden"'),
    "PageShell root overflow-x guard changed."
  );
  assert.ok(
    pageShell.includes('<main className="overflow-x-hidden">'),
    "PageShell main overflow-x guard changed."
  );
  assert.ok(
    pageShell.includes('className="md:pl-72"'),
    "PageShell desktop sidebar offset changed."
  );
});

test("sidebar keeps mobile drawer and desktop split behavior", () => {
  const sidebar = readRepoFile("components/layout/Sidebar.tsx");

  assert.ok(
    sidebar.includes('className="fixed left-0 top-0 z-30 hidden h-screen w-72 border-r border-border bg-card md:block"'),
    "Desktop sidebar contract changed."
  );
  assert.ok(
    sidebar.includes('className="fixed inset-0 z-40 md:hidden"'),
    "Mobile drawer overlay contract changed."
  );
  assert.ok(
    sidebar.includes('className="absolute left-0 top-0 h-screen w-[85vw] max-w-72 border-r border-border bg-card shadow-xl"'),
    "Mobile drawer width contract changed."
  );
});

test("topbar keeps mobile menu trigger visibility contract", () => {
  const topbar = readRepoFile("components/layout/Topbar.tsx");

  assert.ok(
    topbar.includes('className="md:hidden"'),
    "Topbar mobile menu trigger visibility contract changed."
  );
  assert.ok(
    topbar.includes('className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur"'),
    "Topbar sticky contract changed."
  );
});

test("table component keeps horizontal overflow handling for mobile", () => {
  const table = readRepoFile("components/ui/table.tsx");

  assert.ok(
    table.includes('"w-full overflow-auto"'),
    "Table wrapper no longer guarantees horizontal scrolling."
  );
});

test("dashboard root keeps x-overflow protection", () => {
  const dashboardPage = readRepoFile("src/features/dashboard/DashboardPage.tsx");

  assert.ok(
    dashboardPage.includes('className="space-y-5 overflow-x-hidden"'),
    "Dashboard root overflow-x guard changed."
  );
});

test("transactions table keeps explicit mobile fallback for wide columns", () => {
  const transactionsTable = readRepoFile("src/features/transactions/components/TransactionsTable.tsx");

  assert.ok(
    transactionsTable.includes('className="min-w-[920px]"'),
    "Transactions table min-width contract changed."
  );
  assert.ok(
    transactionsTable.includes('containerClassName="max-h-[70vh]'),
    "Transactions table scroll container contract changed."
  );
  assert.ok(
    transactionsTable.includes("Deslize para ver todas as colunas."),
    "Transactions table mobile guidance text changed."
  );
});
