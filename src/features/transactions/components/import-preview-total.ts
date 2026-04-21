type PreviewLikeRow = {
  description: string;
  signedAmount: number;
  documentType?: string | null;
};

type ImportPreviewMetadata = {
  invoicePurchaseTotal?: number | null;
};

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isLikelyCardInvoicePaymentLine(row: PreviewLikeRow): boolean {
  if (row.documentType !== "credit_card_invoice" || row.signedAmount <= 0) {
    return false;
  }

  const description = normalizeForMatch(row.description);
  if (/\b(?:ESTORNO|CREDITO|DEVOLUCAO)\b/.test(description)) {
    return false;
  }

  const hasPayment = /\b(?:PAGAMENTO|PAGTO|PGTO|PAG)\b/.test(description);
  const hasInvoiceHint = /\b(?:FATURA|CARTAO)\b/.test(description);
  const hasOnlineHint = /\bON(?:\s*|-)?LINE\b/.test(description);

  return hasPayment && (hasInvoiceHint || hasOnlineHint);
}

export function resolveImportPreviewTotal(input: {
  rows: PreviewLikeRow[];
  documentType?: string | null;
  metadata?: ImportPreviewMetadata | null;
}): number {
  const defaultNet = input.rows.reduce((sum, row) => sum + row.signedAmount, 0);
  if (input.documentType !== "credit_card_invoice") {
    return defaultNet;
  }

  const invoicePurchaseTotal =
    typeof input.metadata?.invoicePurchaseTotal === "number" && Number.isFinite(input.metadata.invoicePurchaseTotal)
      ? Math.abs(input.metadata.invoicePurchaseTotal)
      : null;

  if (invoicePurchaseTotal !== null) {
    // Credit card purchases are modeled as expense rows in preview.
    return -invoicePurchaseTotal;
  }

  const withoutPaymentRows = input.rows.filter((row) => !isLikelyCardInvoicePaymentLine(row));
  if (withoutPaymentRows.length === 0) {
    return defaultNet;
  }

  return withoutPaymentRows.reduce((sum, row) => sum + row.signedAmount, 0);
}

