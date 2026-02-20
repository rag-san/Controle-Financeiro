const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: "UTC"
});

export function formatBRL(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return brlFormatter.format(0);
  }
  return brlFormatter.format(numeric);
}

export function formatPercent(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0,0%";
  }

  return `${percentFormatter.format(numeric)}%`;
}

export function formatMonthLabel(iso: string): string {
  const [yearPart, monthPart] = iso.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return iso;
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = monthFormatter.format(date).replace(".", "").toLowerCase();
  return `${monthLabel}/${year}`;
}
