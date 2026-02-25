const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const brlCompactFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: "UTC"
});

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const monthYearLongFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric"
});

const dateRangeFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC"
});

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const shortWeekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short"
});

function parseDateInput(value: string): Date | null {
  const compactMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (compactMatch) {
    const year = Number(compactMatch[1]);
    const month = Number(compactMatch[2]);
    const day = Number(compactMatch[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatBRL(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return brlFormatter.format(0);
  }
  return brlFormatter.format(numeric);
}

export function formatBRLCompact(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return brlCompactFormatter.format(0);
  }
  return brlCompactFormatter.format(numeric);
}

export function formatPercent(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0,0%";
  }
  return `${percentFormatter.format(numeric)}%`;
}

export function formatSignedPercent(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0,0%";
  }
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${formatPercent(numeric)}`;
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

export function formatMonthYearLabel(iso: string): string {
  const [yearPart, monthPart] = iso.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return iso;
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  return monthYearFormatter.format(date).replace(".", "");
}

export function formatMonthYearPtBr(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? parseDateInput(dateInput) : dateInput;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const [month, year] = monthYearLongFormatter.format(date).split(" de ");
  if (!month || !year) {
    return monthYearLongFormatter.format(date);
  }

  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalizedMonth} de ${year}`;
}

export function formatDateRange(start: Date, end: Date): string {
  return `${dateRangeFormatter.format(start)} - ${dateRangeFormatter.format(end)}`;
}

export function formatShortDate(date: string): string {
  const parsed = parseDateInput(date);
  if (!parsed) {
    return date;
  }

  return shortDateFormatter.format(parsed);
}

export function formatDateLong(date: string): string {
  const parsed = parseDateInput(date);
  if (!parsed) {
    return date;
  }

  return longDateFormatter.format(parsed);
}

export function formatWeekdayShortPtBr(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? parseDateInput(dateInput) : dateInput;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return shortWeekdayFormatter
    .format(date)
    .replace(".", "")
    .slice(0, 3)
    .toUpperCase();
}
