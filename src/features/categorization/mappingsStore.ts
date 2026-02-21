const STORAGE_KEY = "cf.categorization.mappings.v1";

type MappingRecord = Record<string, string>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sanitizeMappings(raw: unknown): MappingRecord {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const output: MappingRecord = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) continue;
    output[trimmedKey] = trimmedValue;
  }

  return output;
}

function writeMappings(mappings: MappingRecord): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
}

export function getMappings(): MappingRecord {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeMappings(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function setMapping(merchantKey: string, categoryId: string): void {
  const normalizedKey = merchantKey.trim();
  const normalizedCategoryId = categoryId.trim();
  if (!normalizedKey || !normalizedCategoryId) return;

  const mappings = getMappings();
  mappings[normalizedKey] = normalizedCategoryId;
  writeMappings(mappings);
}

export function removeMapping(merchantKey: string): void {
  const normalizedKey = merchantKey.trim();
  if (!normalizedKey) return;

  const mappings = getMappings();
  if (!(normalizedKey in mappings)) return;
  delete mappings[normalizedKey];
  writeMappings(mappings);
}
