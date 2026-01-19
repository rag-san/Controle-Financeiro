import "dotenv/config";
import cors from "cors";
import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const apiKey = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function normalizeText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findMatchingCategory(suggested, categories, fallback) {
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

app.post("/suggest-category", async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
  }

  const { title, categories } = req.body ?? {};

  if (typeof title !== "string" || !Array.isArray(categories)) {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const fallback = categories.includes("Outros") ? "Outros" : categories[0];

  try {
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
            content: `Descrição: ${title}\nCategorias: ${categories.join(", ")}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(500).json({
        error: "Falha ao consultar a OpenAI.",
        details: details || undefined,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const category = findMatchingCategory(content, categories, fallback);

    return res.json({ category });
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao sugerir categoria.",
      details: error instanceof Error ? error.message : undefined,
    });
  }
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
