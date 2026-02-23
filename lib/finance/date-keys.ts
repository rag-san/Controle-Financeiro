const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function toPadded(value: number): string {
  return String(value).padStart(2, "0");
}

function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${toPadded(month)}-${toPadded(day)}`;
}

function isValidYearMonthDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function toDateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const input = value.trim();
  const prefixMatch = input.match(ISO_DATE_PREFIX);
  if (prefixMatch) {
    const year = Number(prefixMatch[1]);
    const month = Number(prefixMatch[2]);
    const day = Number(prefixMatch[3]);
    if (!isValidYearMonthDay(year, month, day)) {
      return null;
    }
    return buildDateKey(year, month, day);
  }

  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function toMonthKey(value: string | Date): string | null {
  const key = toDateKey(value);
  if (!key) return null;
  return key.slice(0, 7);
}

function toLocalDateKey(value: Date): string | null {
  if (!Number.isFinite(value.getTime())) return null;
  return buildDateKey(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

export function dateKeyToNoonDate(dateKey: string): Date | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidYearMonthDay(year, month, day)) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function isDateInRangeByKey(value: string | Date, start: Date, end: Date): boolean {
  const dateKey = toDateKey(value);
  const startKey = toLocalDateKey(start);
  const endKey = toLocalDateKey(end);
  if (!dateKey || !startKey || !endKey) return false;
  return dateKey >= startKey && dateKey <= endKey;
}
