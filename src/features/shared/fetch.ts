import { extractApiError, parseApiResponse } from "@/lib/client/api-response";

export async function fetchJsonOrThrow<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init
  });
  const { data, errorMessage } = await parseApiResponse<T | { error?: unknown }>(response);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (!response.ok || data === null) {
    throw new Error(extractApiError(data, "Nao foi possivel carregar os dados."));
  }

  return data as T;
}

export function notifyFinanceDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("finance-data-changed"));
}
