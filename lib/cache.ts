type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type GlobalCache = Map<string, CacheEntry<unknown>>;

const globalCache = globalThis as typeof globalThis & {
  __finance_cache__?: GlobalCache;
};

const store: GlobalCache = globalCache.__finance_cache__ ?? new Map<string, CacheEntry<unknown>>();

if (!globalCache.__finance_cache__) {
  globalCache.__finance_cache__ = store;
}

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
