const LEGACY_STRICT_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

export function normalizePostgresConnectionString(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return trimmedUrl;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return trimmedUrl;
  }

  const compatibilityMode = parsedUrl.searchParams.get("uselibpqcompat");
  if (compatibilityMode?.toLowerCase() === "true") {
    return trimmedUrl;
  }

  const sslMode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();
  if (!sslMode || !LEGACY_STRICT_SSL_MODES.has(sslMode)) {
    return trimmedUrl;
  }

  parsedUrl.searchParams.set("sslmode", "verify-full");
  return parsedUrl.toString();
}
