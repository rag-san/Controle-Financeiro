function readEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function resolveAuthSecret(): string | undefined {
  const directSecret = readEnvValue("NEXTAUTH_SECRET") ?? readEnvValue("AUTH_SECRET");
  if (directSecret) {
    return directSecret;
  }

  const fallbackSeed =
    readEnvValue("DATABASE_URL") ||
    readEnvValue("POSTGRES_URL") ||
    readEnvValue("POSTGRES_URL_NON_POOLING") ||
    readEnvValue("NEXTAUTH_URL") ||
    readEnvValue("VERCEL_PROJECT_PRODUCTION_URL") ||
    readEnvValue("VERCEL_URL");

  if (!fallbackSeed) {
    return undefined;
  }

  return `financial-control-auth:${fallbackSeed}`;
}

export const AUTH_SECRET = resolveAuthSecret();
