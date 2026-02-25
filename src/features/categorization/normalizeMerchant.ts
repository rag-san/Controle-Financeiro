import type { TransactionDTO } from "@/lib/types";
import { stripInstallmentMarker } from "@/lib/installments";

const NOISE_TOKENS = new Set([
  "pix",
  "ted",
  "doc",
  "tef",
  "pagto",
  "pagamento",
  "pgto",
  "compra",
  "debito",
  "credito",
  "cartao",
  "boleto",
  "transferencia",
  "transfer",
  "transf",
  "saque",
  "deposito",
  "recebido",
  "enviado",
  "parcela",
  "parcelado",
  "parc",
  "ag",
  "conta",
  "cc",
  "cp",
  "ref",
  "n",
  "no",
  "id",
  "data",
  "hora",
  "brl",
  "r",
  "rs"
]);

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sanitizeToken(token: string): string {
  return token.replace(/[^a-z0-9]/g, "");
}

function isNoiseToken(token: string): boolean {
  if (!token) return true;
  if (NOISE_TOKENS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (/^\d{1,2}h\d{0,2}$/.test(token)) return true;
  if (/^\d{1,2}:\d{2}$/.test(token)) return true;
  if (/^\d{2}[/-]\d{2}([/-]\d{2,4})?$/.test(token)) return true;
  if (/^[a-z]?\d+[a-z\d]*$/.test(token)) return true;
  if (token.length <= 1) return true;
  return false;
}

export function normalizeText(value: string): string {
  const normalized = stripDiacritics((value ?? "").toLowerCase())
    .replace(/[|\\/()[\]{}_,;:+*'"`~^!?=]/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

export function extractMerchantKey(transaction: TransactionDTO): string {
  const sanitizedDescription = stripInstallmentMarker(transaction.description || "");
  const baseText = `${sanitizedDescription} ${transaction.account?.name || ""}`.trim();
  const normalized = normalizeText(baseText);

  if (!normalized) {
    return "transacao";
  }

  const tokens = normalized
    .split(" ")
    .map(sanitizeToken)
    .filter((token) => !isNoiseToken(token));

  if (tokens.length === 0) {
    return "transacao";
  }

  return tokens.slice(0, 6).join(" ");
}
