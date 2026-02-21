const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export function formatMoney(value: number | string | { toNumber?: () => number }): string {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return brlFormatter.format(0);
  }
  return brlFormatter.format(numeric);
}

export function parseMoneyInput(value: string | number): number {
  if (typeof value === "number") return value;

  const clean = value.trim();
  if (!clean) return 0;

  const compact = clean.replace(/\s+/g, "");
  const negativeByWrapper =
    compact.startsWith("(") && compact.endsWith(")") || /-\s*$/.test(compact);

  const base = compact
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/-\s*$/, "")
    .replace(/[^\d,.-]/g, "");

  const lastComma = base.lastIndexOf(",");
  const lastDot = base.lastIndexOf(".");

  let normalized = base;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = base.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = base.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    normalized = base.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = base.replace(/,/g, "");
  }

  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;

  if (negativeByWrapper && parsed > 0) {
    return -parsed;
  }

  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseStrictMoneyInput(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/\d/.test(trimmed)) {
    return null;
  }

  const parsed = parseMoneyInput(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
