import type { Category } from "./transactions";

type SuggestCategoryParams = {
  title: string;
  categories: Category[];
  fallback?: Category;
  baseUrl?: string;
};

export async function suggestCategoryWithAI({
  title,
  categories,
  fallback = "Outros",
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001",
}: SuggestCategoryParams) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return fallback;

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/suggest-category`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: trimmedTitle,
        categories,
      }),
    });
  } catch (error) {
    throw new Error(
      "Não foi possível conectar ao backend de IA. Verifique se o servidor está rodando."
    );
  }

  if (!response.ok) {
    let message = "Falha ao obter sugestão da IA.";

    try {
      const data = (await response.json()) as {
        error?: string;
        details?: string;
      };
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

  const data = (await response.json()) as { category?: Category };
  return data.category ?? fallback;
}
