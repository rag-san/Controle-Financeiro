const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const dateRangeFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  day: "numeric",
  year: "numeric"
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

export function formatDateRange(start: Date, end: Date): string {
  return `${dateRangeFormatter.format(start)} - ${dateRangeFormatter.format(end)}`;
}
