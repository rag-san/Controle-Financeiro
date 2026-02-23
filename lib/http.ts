export const privateCacheHeaders = {
  "Cache-Control": "private, max-age=20, stale-while-revalidate=120"
};

type DeprecatedApiHeadersInput = {
  successor: string;
  sunset: string;
  message: string;
};

export function withDeprecatedApiHeaders(
  baseHeaders: Record<string, string>,
  input: DeprecatedApiHeadersInput
): Record<string, string> {
  return {
    ...baseHeaders,
    Deprecation: "true",
    Sunset: input.sunset,
    Link: `<${input.successor}>; rel="successor-version"`,
    Warning: `299 - "${input.message}"`,
    "X-API-Deprecated": "true",
    "X-API-Deprecated-Message": input.message,
    "X-API-Successor": input.successor
  };
}
