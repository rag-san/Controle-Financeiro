export function loadDismissed(key: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set<string>();

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();

    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set<string>();
  }
}

export function saveDismissed(key: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // ignore persistence failures
  }
}

export function loadSnoozed(key: string): Record<string, number> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, number] =>
        typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1])
    );

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function saveSnoozed(key: string, map: Record<string, number>): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore persistence failures
  }
}

export function pruneExpiredSnoozed(
  map: Record<string, number>,
  now: number = Date.now()
): Record<string, number> {
  const nextEntries = Object.entries(map).filter(
    (entry): entry is [string, number] =>
      typeof entry[0] === "string" && typeof entry[1] === "number" && entry[1] > now
  );

  return Object.fromEntries(nextEntries);
}

