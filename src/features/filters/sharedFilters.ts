import { endOfMonth, startOfMonth } from "date-fns";

const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type SharedFilters = {
  from: string;
  to: string;
  type: "" | "income" | "expense" | "transfer";
  accountId: string;
  categoryId: string;
  excluded: "included" | "excluded";
  q: string;
};

function isValidDateInput(value: string | null): value is string {
  if (!value || !DATE_INPUT_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

export function isValidSharedDateInput(value: string | null): value is string {
  return isValidDateInput(value);
}

export function resolveDefaultRange(now = new Date()): { from: string; to: string } {
  const fromDate = startOfMonth(now);
  const toDate = endOfMonth(now);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const toIso = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return { from: toIso(fromDate), to: toIso(toDate) };
}

export function parseSharedFilters(
  searchParams: URLSearchParams,
  now = new Date()
): SharedFilters {
  const defaults = resolveDefaultRange(now);

  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");

  const from = isValidDateInput(rawFrom) ? rawFrom : defaults.from;
  const to = isValidDateInput(rawTo) ? rawTo : defaults.to;

  const typeParam = searchParams.get("type");
  const type: SharedFilters["type"] =
    typeParam === "income" || typeParam === "expense" || typeParam === "transfer" ? typeParam : "";

  const excludedParam = searchParams.get("excluded");
  const excluded: SharedFilters["excluded"] = excludedParam === "true" || excludedParam === "excluded" ? "excluded" : "included";

  return {
    from,
    to,
    type,
    accountId: searchParams.get("accountId") ?? "",
    categoryId: searchParams.get("categoryId") ?? "",
    excluded,
    q: searchParams.get("q") ?? ""
  };
}
