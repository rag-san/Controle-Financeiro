type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  hits: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

const rateLimitStore = new Map<string, RateLimitState>();
let requestsSinceCleanup = 0;

function cleanupExpired(now: number): void {
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  requestsSinceCleanup += 1;

  if (requestsSinceCleanup >= 200) {
    cleanupExpired(now);
    requestsSinceCleanup = 0;
  }

  const existing = rateLimitStore.get(input.key);

  if (!existing || existing.resetAt <= now) {
    const next: RateLimitState = {
      hits: 1,
      resetAt: now + input.windowMs
    };
    rateLimitStore.set(input.key, next);

    return {
      ok: true,
      remaining: Math.max(0, input.limit - 1),
      retryAfterMs: input.windowMs
    };
  }

  existing.hits += 1;
  rateLimitStore.set(input.key, existing);

  const remaining = Math.max(0, input.limit - existing.hits);
  const retryAfterMs = Math.max(0, existing.resetAt - now);

  return {
    ok: existing.hits <= input.limit,
    remaining,
    retryAfterMs
  };
}

export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
