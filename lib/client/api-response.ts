export async function parseApiResponse<T>(
  response: Response
): Promise<{ data: T | null; errorMessage?: string }> {
  const raw = await response.text();

  if (!raw) {
    return {
      data: null,
      errorMessage: response.ok ? undefined : `Resposta vazia do servidor (${response.status})`
    };
  }

  try {
    return { data: JSON.parse(raw) as T };
  } catch {
    return {
      data: null,
      errorMessage: `Servidor retornou resposta invalida (${response.status}).`
    };
  }
}

export function extractApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const root = payload as { error?: unknown };
  if (typeof root.error === "string" && root.error) {
    return root.error;
  }

  if (root.error && typeof root.error === "object") {
    const withMessage = root.error as {
      message?: string;
      formErrors?: string[];
      fieldErrors?: Record<string, string[]>;
    };
    if (withMessage.message) return withMessage.message;
    if (Array.isArray(withMessage.formErrors) && withMessage.formErrors[0]) {
      return withMessage.formErrors[0];
    }
    if (withMessage.fieldErrors) {
      const firstFieldError = Object.values(withMessage.fieldErrors)
        .flat()
        .find((item) => Boolean(item));
      if (firstFieldError) return firstFieldError;
    }
  }

  return fallback;
}

