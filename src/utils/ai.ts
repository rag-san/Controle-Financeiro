import { normalizeText, type Category } from "./transactions";

type SuggestCategoryParams = {
  apiKey: string;
  title: string;
  categories: Category[];
  fallback?: Category;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function findMatchingCategory(
  suggested: string,
  categories: Category[],
  fallback: Category
) {
  const normalizedSuggestion = normalizeText(suggested);
  if (!normalizedSuggestion) return fallback;

  const normalizedCategories = categories.map((category) => ({
    raw: category,
    normalized: normalizeText(category),
  }));

  const direct = normalizedCategories.find(
    (item) => item.normalized === normalizedSuggestion
  );

  if (direct) return direct.raw;

  const partial = normalizedCategories.find(
    (item) =>
      item.normalized && normalizedSuggestion.includes(item.normalized)
  );

  return partial?.raw ?? fallback;
}

export async function suggestCategoryWithAI({
  apiKey,
  title,
  categories,
  fallback = "Outros",
}: SuggestCategoryParams) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return fallback;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Você recebe uma descrição de gasto e uma lista de categorias. Responda somente com o nome de uma categoria da lista. Se não houver correspondência clara, responda 'Outros'.",
        },
        {
          role: "user",
          content: `Descrição: ${trimmedTitle}\nCategorias: ${categories.join(
            ", "
          )}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("Falha ao obter sugestão da IA.");
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  return findMatchingCategory(content, categories, fallback);
}
