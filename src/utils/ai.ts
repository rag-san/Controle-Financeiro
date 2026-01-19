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

  const response = await fetch(`${baseUrl}/suggest-category`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: trimmedTitle,
      categories,
    }),
  });

  if (!response.ok) {
    throw new Error("Falha ao obter sugestão da IA.");
  }

  const data = (await response.json()) as { category?: Category };
  return data.category ?? fallback;
}
