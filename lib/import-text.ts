import { stripInstallmentMarker } from "@/lib/installments";

export type ImportTextEncoding = "utf8" | "latin1" | "cp1252";

type NormalizeImportTextOptions = {
  uppercase?: boolean;
  stripAccents?: boolean;
  removeNoise?: boolean;
};

const UTF8_MOJIBAKE_FIXES: Array<[string, string]> = [
  ["Ã¡", "á"],
  ["Ã ", "à"],
  ["Ã¢", "â"],
  ["Ã£", "ã"],
  ["Ã¤", "ä"],
  ["Ã©", "é"],
  ["Ãª", "ê"],
  ["Ã¨", "è"],
  ["Ã­", "í"],
  ["Ã¬", "ì"],
  ["Ã³", "ó"],
  ["Ã²", "ò"],
  ["Ã´", "ô"],
  ["Ãµ", "õ"],
  ["Ãº", "ú"],
  ["Ã¹", "ù"],
  ["Ã§", "ç"],
  ["Ã", "Á"],
  ["Ã€", "À"],
  ["Ã‚", "Â"],
  ["Ãƒ", "Ã"],
  ["Ã‰", "É"],
  ["ÃŠ", "Ê"],
  ["Ã", "Í"],
  ["Ã“", "Ó"],
  ["Ã”", "Ô"],
  ["Ã•", "Õ"],
  ["Ãš", "Ú"],
  ["Ã‡", "Ç"],
  ["â€“", "-"],
  ["â€”", "-"],
  ["â€˜", "'"],
  ["â€™", "'"],
  ["â€œ", "\""],
  ["â€", "\""],
  ["â€¢", "*"],
  ["â€¦", "..."]
];

const NOISE_PREFIX_PATTERNS = [
  /^NO\s+ESTABELECIMENTO\s*[:\-]?\s*/i,
  /^COMPRA\s+NO\s+ESTABELECIMENTO\s*[:\-]?\s*/i,
  /^ESTABELECIMENTO\s*[:\-]?\s*/i
];

const LOCATION_NOISE_TOKENS = /\b(?:ITU|BRA|BRASIL)\b/gi;

const MERCHANT_NOISE_TOKENS = new Set([
  "PIX",
  "PAGAMENTO",
  "PAGTO",
  "PGTO",
  "COMPRA",
  "DEBITO",
  "DEBIT",
  "CREDITO",
  "CREDITO",
  "TRANSFERENCIA",
  "TRANSFER",
  "TRANSF",
  "RECEBIDO",
  "ENVIADO",
  "DOC",
  "TED",
  "TEF",
  "TARIFA",
  "JUROS",
  "IOF",
  "MORA",
  "MULTA",
  "PARCELA",
  "PARCELADO",
  "PARC",
  "NO",
  "EM",
  "NOESTABELECIMENTO",
  "ESTABELECIMENTO",
  "BR",
  "BRA",
  "ITU",
  "R",
  "RS"
]);

function decodeWithWindows1252(buffer: Buffer): string {
  try {
    return new TextDecoder("windows-1252").decode(buffer);
  } catch {
    return buffer.toString("latin1");
  }
}

function scoreDecodedText(text: string): number {
  const replacement = (text.match(/\uFFFD/g) ?? []).length;
  const utf8Artifacts = (text.match(/[ÃÂâ]/g) ?? []).length;
  const controls = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  return replacement * 40 + utf8Artifacts * 4 + controls * 2;
}

export function decodeImportText(buffer: Buffer): { text: string; encoding: ImportTextEncoding } {
  const utf8 = buffer.toString("utf8");
  const latin1 = buffer.toString("latin1");
  const cp1252 = decodeWithWindows1252(buffer);

  const candidates: Array<{ text: string; encoding: ImportTextEncoding; score: number }> = [
    { text: utf8, encoding: "utf8", score: scoreDecodedText(utf8) },
    { text: latin1, encoding: "latin1", score: scoreDecodedText(latin1) },
    { text: cp1252, encoding: "cp1252", score: scoreDecodedText(cp1252) }
  ];

  candidates.sort((first, second) => first.score - second.score);
  return {
    text: candidates[0]?.text ?? utf8,
    encoding: candidates[0]?.encoding ?? "utf8"
  };
}

export function fixCommonMojibake(value: string): string {
  if (!value) return "";

  let output = value;

  for (const [from, to] of UTF8_MOJIBAKE_FIXES) {
    output = output.split(from).join(to);
  }

  output = output
    .replace(/Descri(?:[�?]{1,}|Ã§Ã£)o/gi, "Descricao")
    .replace(/Lan(?:[�?]{1,}|Ã§)amento/gi, "Lancamento")
    .replace(/Hist(?:[�?]{1,}|Ã³)rico/gi, "Historico")
    .replace(/[�]+/g, " ");

  return output;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeImportText(value: string, options: NormalizeImportTextOptions = {}): string {
  const { uppercase = false, stripAccents: strip = false, removeNoise = true } = options;

  let output = fixCommonMojibake(value ?? "");

  output = output
    .replace(/\r?\n+/g, " ")
    .replace(/[\t]+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/[;:]{2,}/g, " ")
    .replace(/[.,]{2,}/g, " ")
    .trim();

  if (removeNoise) {
    for (const pattern of NOISE_PREFIX_PATTERNS) {
      output = output.replace(pattern, "");
    }

    output = output.replace(LOCATION_NOISE_TOKENS, " ");
  }

  output = output
    .replace(/\s*-\s*-\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (strip) {
    output = stripAccents(output);
  }

  if (uppercase) {
    output = output.toUpperCase();
  }

  return output;
}

export function normalizeImportTextForMatch(value: string): string {
  return normalizeImportText(value, {
    uppercase: true,
    stripAccents: true,
    removeNoise: true
  });
}

function cleanMerchantToken(token: string): string {
  return token.replace(/[^A-Z0-9]/g, "");
}

function isMerchantNoiseToken(token: string): boolean {
  if (!token) return true;
  if (MERCHANT_NOISE_TOKENS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (token.length <= 1) return true;
  return false;
}

export function buildMerchantKey(value: string): string {
  const normalized = normalizeImportTextForMatch(stripInstallmentMarker(value));
  if (!normalized) return "transacao";

  const tokens = normalized
    .split(" ")
    .map(cleanMerchantToken)
    .filter((token) => !isMerchantNoiseToken(token));

  if (tokens.length === 0) return "transacao";

  return tokens.slice(0, 6).join(" ").toLowerCase();
}

const PERSON_STOPWORDS = new Set([
  "SUPERMERCADO",
  "MERCADO",
  "PADARIA",
  "LANCHES",
  "RESTAURANTE",
  "POSTO",
  "IPIRANGA",
  "FARMACIA",
  "LOJA",
  "MERCANTIL",
  "LTDA",
  "SA",
  "ME",
  "EPP",
  "EIRELI"
]);

export function looksLikePersonName(value: string): boolean {
  const normalized = normalizeImportTextForMatch(value);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter((token) => token.length > 1);
  if (tokens.length < 2 || tokens.length > 5) return false;

  if (tokens.some((token) => PERSON_STOPWORDS.has(token))) return false;

  const alphaTokens = tokens.filter((token) => /^[A-Z]+$/.test(token));
  if (alphaTokens.length < 2) return false;

  return true;
}

