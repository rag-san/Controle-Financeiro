type JsonValue = Record<string, unknown> | unknown[] | string | number | null;

export function normalizeBaseUrl(baseUrl?: string) {
  if (!baseUrl) return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function getApiBaseUrl(baseUrl?: string) {
  return normalizeBaseUrl(baseUrl ?? import.meta.env.VITE_API_BASE_URL);
}

type RequestOptions = {
  method?: string;
  body?: JsonValue;
  headers?: Record<string, string>;
  baseUrl?: string;
};

export async function requestJson<T>(
  path: string,
  { method = "GET", body, headers, baseUrl }: RequestOptions = {}
) {
  const resolvedBaseUrl = getApiBaseUrl(baseUrl);

  let response: Response;

  try {
    response = await fetch(`${resolvedBaseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao backend. Verifique se o servidor está rodando."
    );
  }

  if (!response.ok) {
    let message = "Falha ao consultar o backend.";

    try {
      const data = (await response.json()) as { error?: string; details?: string };
      if (data?.error) {
        message = data.error;
        if (data.details) {
          message = `${message} ${data.details}`;
        }
      }
    } catch {
      // ignore JSON parse errors
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}
