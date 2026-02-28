import { normalizeDescription, parseFlexibleDate } from "@/lib/normalize";
import { buildMerchantKey, normalizeImportText, normalizeImportTextForMatch } from "@/lib/import-text";

export type CanonicalSourceType = "csv" | "ofx" | "pdf" | "manual";

export type CanonicalImportRow = {
  date: Date;
  amount: number;
  balanceAfter?: number | null;
  transactionKindRaw: string;
  counterpartyRaw: string;
  transactionKindNorm: string;
  counterpartyNorm: string;
  merchantKey: string;
  sourceType: CanonicalSourceType;
  documentType?: string | null;
  description: string;
  normalizedDescription: string;
  type: "income" | "expense" | "transfer";
  externalId?: string;
  accountHint?: string;
  accountId?: string;
  categoryId?: string | null;
  raw: Record<string, unknown>;
};

type ExtractInput = {
  sourceType: CanonicalSourceType;
  transactionKindRaw?: string | null;
  counterpartyRaw?: string | null;
  description?: string | null;
};

type CanonicalInput = {
  date: Date | string;
  amount: number;
  balanceAfter?: number | null;
  sourceType: CanonicalSourceType;
  documentType?: string | null;
  transactionKindRaw?: string | null;
  counterpartyRaw?: string | null;
  description?: string | null;
  type?: "income" | "expense" | "transfer";
  externalId?: string;
  accountHint?: string;
  accountId?: string;
  categoryId?: string | null;
  raw?: Record<string, unknown>;
};

type SplitResult = {
  transactionKindRaw: string;
  counterpartyRaw: string;
};

const SPLIT_PATTERNS: Array<{ regex: RegExp; kind: string }> = [
  { regex: /^pix\s+enviado\s*[:\-]\s*(.+)$/i, kind: "Pix enviado" },
  { regex: /^pix\s+recebido\s*[:\-]\s*(.+)$/i, kind: "Pix recebido" },
  { regex: /^compra\s+no\s+debito\s*[:\-]\s*(.+)$/i, kind: "Compra no debito" },
  { regex: /^compra\s+debito\s*[:\-]\s*(.+)$/i, kind: "Compra no debito" },
  { regex: /^pagamento\s+efetuado\s*[:\-]\s*(.+)$/i, kind: "Pagamento efetuado" }
];

function cleanRawField(value: string | null | undefined): string {
  return normalizeImportText(value ?? "", {
    uppercase: false,
    stripAccents: false,
    removeNoise: false
  });
}

function splitComposedDescription(description: string): SplitResult | null {
  const cleaned = cleanRawField(description);
  if (!cleaned) return null;

  for (const entry of SPLIT_PATTERNS) {
    const match = cleaned.match(entry.regex);
    if (!match?.[1]) continue;
    return {
      transactionKindRaw: entry.kind,
      counterpartyRaw: cleanRawField(match[1])
    };
  }

  const generic = cleaned.match(/^([A-Za-zÀ-ÿ ]{3,40})\s*[:\-]\s*(.+)$/);
  if (!generic?.[1] || !generic[2]) {
    return null;
  }

  return {
    transactionKindRaw: cleanRawField(generic[1]),
    counterpartyRaw: cleanRawField(generic[2])
  };
}

function inferKindFromText(description: string): string {
  const norm = normalizeImportTextForMatch(description);
  if (!norm) return "Transacao";

  if (norm.includes("PIX ENVIADO")) return "Pix enviado";
  if (norm.includes("PIX RECEBIDO")) return "Pix recebido";
  if (norm.includes("PIX")) return "Pix";
  if (norm.includes("COMPRA NO DEBITO") || norm.includes("COMPRA DEBITO")) return "Compra no debito";
  if (norm.includes("COMPRA")) return "Compra";
  if (norm.includes("PAGAMENTO EFETUADO")) return "Pagamento efetuado";
  if (norm.includes("PAGAMENTO")) return "Pagamento";
  if (norm.includes("TARIFA")) return "Tarifa";
  if (norm.includes("JUROS")) return "Juros";
  if (norm.includes("IOF")) return "IOF";
  if (norm.includes("MULTA")) return "Multa";

  return "Transacao";
}

function extractTransactionKindAndCounterparty(input: ExtractInput): SplitResult {
  const explicitKind = cleanRawField(input.transactionKindRaw);
  const explicitCounterparty = cleanRawField(input.counterpartyRaw);
  const fallbackDescription = cleanRawField(input.description);

  let transactionKindRaw = explicitKind;
  let counterpartyRaw = explicitCounterparty;

  if ((!transactionKindRaw || !counterpartyRaw) && fallbackDescription) {
    const split = splitComposedDescription(fallbackDescription);
    if (split) {
      transactionKindRaw = transactionKindRaw || split.transactionKindRaw;
      counterpartyRaw = counterpartyRaw || split.counterpartyRaw;
    }
  }

  if (!counterpartyRaw) {
    counterpartyRaw = fallbackDescription || transactionKindRaw || "Sem descricao";
  }

  if (!transactionKindRaw) {
    transactionKindRaw = inferKindFromText(fallbackDescription || counterpartyRaw);
  }

  return {
    transactionKindRaw: transactionKindRaw || "Transacao",
    counterpartyRaw: counterpartyRaw || "Sem descricao"
  };
}

export function toCanonicalImportRow(input: CanonicalInput): CanonicalImportRow {
  const date = parseFlexibleDate(input.date);
  const amount = Number(input.amount);
  const extracted = extractTransactionKindAndCounterparty({
    sourceType: input.sourceType,
    transactionKindRaw: input.transactionKindRaw,
    counterpartyRaw: input.counterpartyRaw,
    description: input.description
  });

  const transactionKindNorm = normalizeImportTextForMatch(extracted.transactionKindRaw);
  const counterpartyNorm = normalizeImportTextForMatch(extracted.counterpartyRaw);
  const description = extracted.counterpartyRaw || cleanRawField(input.description) || "Sem descricao";
  const normalizedDescription = normalizeDescription(description);
  const merchantKey = buildMerchantKey(extracted.counterpartyRaw || description);

  return {
    date,
    amount,
    balanceAfter: input.balanceAfter ?? null,
    transactionKindRaw: extracted.transactionKindRaw,
    counterpartyRaw: extracted.counterpartyRaw,
    transactionKindNorm,
    counterpartyNorm,
    merchantKey,
    sourceType: input.sourceType,
    documentType: input.documentType ?? null,
    description,
    normalizedDescription,
    type: input.type ?? (amount >= 0 ? "income" : "expense"),
    externalId: input.externalId,
    accountHint: input.accountHint,
    accountId: input.accountId,
    categoryId: input.categoryId,
    raw: input.raw ?? {}
  };
}

