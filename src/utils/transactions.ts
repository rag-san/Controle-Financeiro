export type TransactionType = "entrada" | "saida";

export type Category =
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Lazer"
  | "Saúde"
  | "Educação"
  | "Assinaturas"
  | "Salário"
  | "Outros";

export type Transaction = {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  category: Category;
};

export const STORAGE_KEY = "cf_transactions_v7";

export const CATEGORIES: Category[] = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Lazer",
  "Saúde",
  "Educação",
  "Assinaturas",
  "Salário",
  "Outros",
];

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeHeader(s: string) {
  return normalizeSpaces(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function toISODate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY
  const br = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(/[R$\s]/g, "");

  // 1.234,56
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // 123,45 ou 123.45
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function splitCSVLine(line: string, delimiter: "," | ";") {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" vira "
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => v.trim());
}

export function detectDelimiterFromLine(line: string): "," | ";" {
  const semis = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semis >= commas ? ";" : ",";
}

export function makeSignature(t: {
  date: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: Category;
}) {
  return `${t.date}|${normalizeSpaces(t.title).toLowerCase()}|${t.amount.toFixed(
    2
  )}|${t.type}|${t.category}`;
}

export function guessColumnIndex(
  headers: string[],
  kind: "date" | "desc" | "value"
) {
  const h = headers.map(normalizeHeader);

  const findAny = (needles: string[]) => {
    for (let i = 0; i < h.length; i++) {
      for (const n of needles) {
        if (h[i].includes(n)) return i;
      }
    }
    return -1;
  };

  if (kind === "date") return findAny(["data", "date", "lancamento"]);
  if (kind === "desc")
    return findAny(["descricao", "descr", "historico", "hist", "memo"]);
  return findAny(["valor", "value", "amount", "debito", "credito"]);
}

export function pickHeaderLineIndex(lines: string[], delimiter: "," | ";") {
  // procura a linha que realmente é o header:
  // - tem >= 3 colunas
  // - tem palavras chave tipo data/valor/descricao/historico/saldo
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const cols = splitCSVLine(lines[i], delimiter);
    if (cols.length < 3) continue;

    const nonEmpty = cols.filter((c) => c.trim().length > 0).length;
    const joined = cols.map(normalizeHeader).join(" ");

    const hasKeywords =
      joined.includes("data") ||
      joined.includes("valor") ||
      joined.includes("descricao") ||
      joined.includes("historico") ||
      joined.includes("saldo");

    const score = cols.length + nonEmpty + (hasKeywords ? 10 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function escapeCsvValue(value: string) {
  const needsQuotes = /[";\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function buildTransactionsCsv(transactions: Transaction[]) {
  const header = ["Data", "Descrição", "Valor", "Tipo", "Categoria"];
  const lines = transactions.map((t) =>
    [
      t.date,
      t.title,
      t.amount.toFixed(2).replace(".", ","),
      t.type,
      t.category,
    ]
      .map((value) => escapeCsvValue(value))
      .join(";")
  );

  return [header.join(";"), ...lines].join("\n");
}
