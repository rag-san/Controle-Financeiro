import { normalizeDescription } from "@/lib/normalize";

type AiCategory = {
  id: string;
  name: string;
};

type LocalAiInput = {
  description: string;
  normalizedDescription: string;
  amount: number;
  accountName?: string | null;
  categories: AiCategory[];
};

type LocalAiResponse = {
  category?: string;
  confidence?: number;
};

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MIN_CONFIDENCE = 0.55;
const DEFAULT_ABORT_RETRIES = 1;

function extractJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const content = fenced[1].trim();
    if (content.startsWith("{") && content.endsWith("}")) {
      return content;
    }
  }

  const objectLike = trimmed.match(/\{[\s\S]*\}/);
  return objectLike?.[0] ?? null;
}

function parseAiPayload(text: string): LocalAiResponse | null {
  const jsonText = extractJsonText(text);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as LocalAiResponse;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || /aborted/i.test(error.message);
  }

  return false;
}

async function callOllamaGenerate(input: {
  ollamaUrl: string;
  ollamaModel: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.ollamaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.ollamaModel,
        prompt: input.prompt,
        stream: false,
        options: {
          temperature: 0.1
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`IA local respondeu HTTP ${response.status}`);
    }

    const raw = (await response.json()) as { response?: string };
    return typeof raw.response === "string" ? raw.response : null;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Tempo limite da IA local excedido (${input.timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestCategoryWithLocalAi(input: LocalAiInput): Promise<string | null> {
  if (input.categories.length === 0) {
    return null;
  }

  const ollamaUrl = (process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).trim();
  const ollamaModel = (process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL).trim();
  const timeoutMs = Math.max(600, Number(process.env.LOCAL_AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS));
  const abortRetries = Math.max(0, Number(process.env.LOCAL_AI_ABORT_RETRIES ?? DEFAULT_ABORT_RETRIES));
  const minConfidence = Math.min(1, Math.max(0, Number(process.env.LOCAL_AI_MIN_CONFIDENCE ?? DEFAULT_MIN_CONFIDENCE)));

  const availableCategories = input.categories.map((item) => `${item.id} => ${item.name}`).join("\n");
  const amountLabel = input.amount >= 0 ? "receita" : "despesa";

  const prompt = [
    "Classifique a transacao em apenas UMA categoria da lista.",
    "Retorne exclusivamente JSON no formato: {\"category\":\"<id ou nome>\",\"confidence\":0.0}",
    "Se estiver incerto, retorne confidence menor que 0.55.",
    "",
    "Categorias disponiveis:",
    availableCategories,
    "",
    `Descricao: ${input.description}`,
    `Descricao normalizada: ${input.normalizedDescription}`,
    `Valor: ${input.amount.toFixed(2)} (${amountLabel})`,
    `Conta: ${input.accountName ?? "nao informada"}`
  ].join("\n");

  let rawResponse: string | null = null;
  let nextTimeout = timeoutMs;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= abortRetries; attempt += 1) {
    try {
      rawResponse = await callOllamaGenerate({
        ollamaUrl,
        ollamaModel,
        prompt,
        timeoutMs: nextTimeout
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < abortRetries && isAbortError(error)) {
        nextTimeout = Math.min(Math.round(nextTimeout * 1.8), 60000);
        continue;
      }
      break;
    }
  }

  if (lastError) {
    throw lastError;
  }

  if (!rawResponse) {
    return null;
  }

  const parsed = parseAiPayload(rawResponse);
  if (!parsed?.category) {
    return null;
  }

  const confidence = toFiniteNumber(parsed.confidence);
  if (confidence !== null && confidence < minConfidence) {
    return null;
  }

  const normalizedChoice = normalizeDescription(parsed.category);
  const selected = input.categories.find((item) => {
    return item.id === parsed.category || normalizeDescription(item.name) === normalizedChoice;
  });

  return selected?.id ?? null;
}
