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
  "RS",
  "ONLINE",
  "ONLINE",
  "COMP",
  "COMPR",
  "COMPRAN",
  "PARCELADO",
  "PARCELAMENTO",
  "FATURA",
  "REF",
  "REFERENCIA",
  "COD",
  "CODIGO",
  "AUT",
  "AUTORIZACAO",
  "BANCO",
  "AGENCIA",
  "CONTA",
  "CPF",
  "CNPJ",
  "PAG",
  "PEDIDO",
  "DELIVERY",
  "APP",
  "APLICATIVO",
  "NUBANK",
  "INTER",
  "ITAU",
  "BRADESCO",
  "SANTANDER"
]);

const MERCHANT_TOKEN_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bI\s*FOOD\b/g, replacement: "IFOOD" },
  { pattern: /\bIFD\b/g, replacement: "IFOOD" },
  { pattern: /\bUBER\s+EATS\b/g, replacement: "UBEREATS" },
  { pattern: /\bMERCADO\s+PAGO\b/g, replacement: "MERCADOPAGO" },
  { pattern: /\bPAG\s*SEGURO\b/g, replacement: "PAGSEGURO" },
  { pattern: /\bPAY\s*PAL\b/g, replacement: "PAYPAL" },
  { pattern: /\bGOOGLE\s+PLAY\b/g, replacement: "GOOGLEPLAY" },
  { pattern: /\bPRIME\s+VIDEO\b/g, replacement: "PRIMEVIDEO" },
  { pattern: /\bSEM\s+PARAR\b/g, replacement: "SEMPARAR" },
  { pattern: /\bPAGUE\s+MENOS\b/g, replacement: "PAGUEMENOS" },
  { pattern: /\bAPPLE\.?COM\/BILL\b/g, replacement: "APPLE" },
  { pattern: /\bDROGA\s+RAIA\b/g, replacement: "DROGARAIA" },
  { pattern: /\bMC\s*DONALD'?S?\b/g, replacement: "MCDONALDS" }
];

const PROCESSOR_TOKENS = new Set([
  "MERCADOPAGO",
  "PAGSEGURO",
  "PAYPAL",
  "STRIPE",
  "STONE",
  "CIELO",
  "PICPAY",
  "APPMAX",
  "ASAAS",
  "INFINITEPAY",
  "PAGARME",
  "SUMUP"
]);

const GENERIC_MERCHANT_TOKENS = new Set([
  "LOJA",
  "STORE",
  "SHOP",
  "COMPRA",
  "SERVICO",
  "SERVICOS",
  "PAGAMENTO"
]);

const MARKETPLACE_FAMILY_TOKENS = new Set(["IFOOD", "UBER", "UBEREATS", "RAPPI"]);

export type MerchantDescriptor = {
  merchantKey: string;
  merchantLabel: string | null;
  merchantTokens: string[];
  processorTokens: string[];
  processorOnly: boolean;
  ambiguous: boolean;
  family: string | null;
};

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
    .replace(/Opera(?:[�?]{1,}|Ã§Ã£)o/gi, "Operacao")
    .replace(/Transf(?:[�?]{1,}|Ãª)rencia/gi, "Transferencia")
    .replace(/Cart(?:[�?]{1,}|Ã£)o/gi, "Cartao")
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

function canonicalizeMerchantToken(token: string): string {
  if (!token) return "";
  if (/^(?:IFD|IFOOD)+[A-Z0-9]*$/.test(token)) return "IFOOD";
  if (/^UBEREATS[A-Z0-9]*$/.test(token)) return "UBEREATS";
  if (/^UBER[A-Z0-9]*$/.test(token)) return "UBER";
  if (/^(?:99|99APP|99POP|99TAXI)[A-Z0-9]*$/.test(token)) return "99";
  if (/^MERCADOPAGO[A-Z0-9]*$/.test(token)) return "MERCADOPAGO";
  if (/^PAGSEGURO[A-Z0-9]*$/.test(token)) return "PAGSEGURO";
  if (/^PAYPAL[A-Z0-9]*$/.test(token)) return "PAYPAL";
  if (/^STRIPE[A-Z0-9]*$/.test(token)) return "STRIPE";
  if (/^STONE[A-Z0-9]*$/.test(token)) return "STONE";
  if (/^CIELO[A-Z0-9]*$/.test(token)) return "CIELO";
  if (/^PICPAY[A-Z0-9]*$/.test(token)) return "PICPAY";
  if (/^APPMAX[A-Z0-9]*$/.test(token)) return "APPMAX";
  if (/^SUPERMERCADOS[A-Z0-9]*$/.test(token)) return "SUPERMERCADO";
  if (/^RESTAURANTES[A-Z0-9]*$/.test(token)) return "RESTAURANTE";
  if (/^NETFLIX[A-Z0-9]*$/.test(token)) return "NETFLIX";
  if (/^SPOTIFY[A-Z0-9]*$/.test(token)) return "SPOTIFY";
  if (/^AMAZON[A-Z0-9]*$/.test(token)) return "AMAZON";
  if (/^PRIMEVIDEO[A-Z0-9]*$/.test(token)) return "PRIMEVIDEO";
  if (/^YOUTUBE[A-Z0-9]*$/.test(token)) return "YOUTUBE";
  if (/^GOOGLEPLAY[A-Z0-9]*$/.test(token)) return "GOOGLEPLAY";
  if (/^PRIMEVIDEO[A-Z0-9]*$/.test(token)) return "PRIMEVIDEO";
  if (/^SEMPARAR[A-Z0-9]*$/.test(token)) return "SEMPARAR";
  if (/^PAGUEMENOS[A-Z0-9]*$/.test(token)) return "PAGUEMENOS";
  if (/^APPLE[A-Z0-9]*$/.test(token)) return "APPLE";
  if (/^MCDONALDS[A-Z0-9]*$/.test(token)) return "MCDONALDS";
  if (/^DROGARAIA[A-Z0-9]*$/.test(token)) return "DROGARAIA";
  if (/^DROGASIL[A-Z0-9]*$/.test(token)) return "DROGASIL";
  if (/^CARREFOUR[A-Z0-9]*$/.test(token)) return "CARREFOUR";
  if (/^IPIRANGA[A-Z0-9]*$/.test(token)) return "IPIRANGA";
  if (/^SHELL[A-Z0-9]*$/.test(token)) return "SHELL";
  return token;
}

function isMerchantNoiseToken(token: string): boolean {
  if (!token) return true;
  if (MERCHANT_NOISE_TOKENS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (/^(?:PAG|PGTO|PAGTO)[A-Z0-9]{0,6}$/.test(token)) return true;
  if (/^(?:\d+[A-Z]+|[A-Z]+\d+)[A-Z0-9]*$/.test(token)) return true;
  if (/^\d{2,}[A-Z0-9]*$/.test(token)) return true;
  if (token.length <= 1) return true;
  return false;
}

function dedupeTokens(tokens: string[]): string[] {
  const output: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    if (output[output.length - 1] === token) continue;
    output.push(token);
  }

  return output;
}

function normalizeMerchantTokens(value: string): string[] {
  let normalized = normalizeImportTextForMatch(stripInstallmentMarker(value));
  if (!normalized) return [];

  for (const replacement of MERCHANT_TOKEN_REPLACEMENTS) {
    normalized = normalized.replace(replacement.pattern, ` ${replacement.replacement} `);
  }

  normalized = normalized.replace(/\s+/g, " ").trim();

  return dedupeTokens(
    normalized
      .split(" ")
      .map(cleanMerchantToken)
      .map(canonicalizeMerchantToken)
      .filter((token) => !isMerchantNoiseToken(token))
  );
}

export function extractMerchantDescriptor(value: string): MerchantDescriptor {
  const tokens = normalizeMerchantTokens(value);
  if (tokens.length === 0) {
    return {
      merchantKey: "transacao",
      merchantLabel: null,
      merchantTokens: [],
      processorTokens: [],
      processorOnly: false,
      ambiguous: true,
      family: null
    };
  }

  const processorTokens = tokens.filter((token) => PROCESSOR_TOKENS.has(token));
  const withoutProcessors = tokens.filter((token) => !PROCESSOR_TOKENS.has(token));
  const merchantTokensBase = withoutProcessors.length > 0 ? withoutProcessors : processorTokens;
  const merchantTokens =
    merchantTokensBase.length > 1 && MARKETPLACE_FAMILY_TOKENS.has(merchantTokensBase[0] ?? "")
      ? merchantTokensBase.filter(
          (token, index) => index === 0 || token.length > 3
        )
      : merchantTokensBase;
  const processorOnly = processorTokens.length > 0 && withoutProcessors.length === 0;
  const limitedTokens = merchantTokens.slice(0, 6);
  const merchantKey = limitedTokens.length > 0 ? limitedTokens.join(" ").toLowerCase() : "transacao";
  const ambiguous =
    processorOnly ||
    limitedTokens.length === 0 ||
    limitedTokens.every((token) => GENERIC_MERCHANT_TOKENS.has(token));

  return {
    merchantKey,
    merchantLabel: limitedTokens.length > 0 ? limitedTokens.join(" ").toLowerCase() : null,
    merchantTokens: limitedTokens,
    processorTokens,
    processorOnly,
    ambiguous,
    family: limitedTokens[0] ? limitedTokens[0].toLowerCase() : null
  };
}

export function buildMerchantKey(value: string): string {
  return extractMerchantDescriptor(value).merchantKey;
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

