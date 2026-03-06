import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("dashboard filter trigger keeps locked label and icon contract", () => {
  const dashboardPage = readRepoFile("src/features/dashboard/DashboardPage.tsx");

  assert.ok(
    dashboardPage.includes(
      'const filterButtonLabel = isMonthFilterActive ? `Filtro: ${appliedMonthLabel}` : "Filtros";'
    ),
    "Dashboard filter label contract changed."
  );
  assert.ok(
    dashboardPage.includes('<SlidersHorizontal className="h-4 w-4" />'),
    "Dashboard filter icon contract changed."
  );
  assert.ok(
    dashboardPage.includes("{filterButtonLabel}"),
    "Dashboard filter button no longer renders the locked label token."
  );
});

test("theme toggle keeps locked icon button entrypoint in topbar", () => {
  const topbar = readRepoFile("components/layout/Topbar.tsx");

  assert.ok(
    topbar.includes('aria-label="Alternar tema"'),
    "Theme toggle aria-label changed."
  );
  assert.ok(
    topbar.includes("icon={theme === \"dark\" ? <Sun className=\"h-4 w-4\" /> : <Moon className=\"h-4 w-4\" />}"),
    "Theme toggle icon contract changed."
  );
});

test("shared IconButton keeps locked visual tokens used by top-right controls", () => {
  const iconButton = readRepoFile("src/components/ui/IconButton.tsx");

  assert.ok(
    iconButton.includes('md: "h-9 w-9 rounded-xl"'),
    "IconButton md size token changed."
  );
  assert.ok(
    iconButton.includes(
      '"inline-flex items-center justify-center border border-slate-200 bg-white text-slate-500 transition-colors",'
    ),
    "IconButton base visual contract changed."
  );
  assert.ok(
    iconButton.includes(
      '"dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",'
    ),
    "IconButton dark visual contract changed."
  );
});

test("notifications bell keeps locked button shape and semantics", () => {
  const notificationsBell = readRepoFile("src/features/insights/components/NotificationsBell.tsx");

  assert.ok(
    notificationsBell.includes('aria-label="Abrir notificações"'),
    "Notifications bell aria-label changed."
  );
  assert.ok(
    notificationsBell.includes(
      '"relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition",'
    ),
    "Notifications bell visual contract changed."
  );
});
