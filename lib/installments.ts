export type InstallmentInfo = {
  currentInstallment: number;
  totalInstallments: number;
  remainingInstallments: number;
  marker: string;
  baseDescription: string;
  normalizedBaseDescription: string;
};

type InstallmentMatch = {
  current: number;
  total: number;
  marker: string;
  start: number;
  end: number;
};

const INSTALLMENT_PATTERNS = [
  /\b(?:PARCELA|PARCELADO|PARC|PCLA|PCL)\.?\s*(\d{1,3})\s*(?:DE|\/)\s*(\d{1,3})\b/i,
  /\b(\d{1,3})\s*\/\s*(\d{1,3})\s*(?:PARCELA|PARCELADO|PARC|PCLA|PCL)\b/i,
  /\b(?:PARCELA|PARCELADO|PARC|PCLA|PCL)\.?\s*(\d{1,3})\s*-\s*(\d{1,3})\b/i
];

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLikeDescription(value: string): string {
  return normalizeSpaces(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
  );
}

function sanitizeBaseDescription(value: string): string {
  return normalizeSpaces(value.replace(/^[\s\-:|()[\].,]+|[\s\-:|()[\].,]+$/g, ""));
}

function parseInstallmentNumbers(currentRaw: string, totalRaw: string): { current: number; total: number } | null {
  const current = Number.parseInt(currentRaw, 10);
  const total = Number.parseInt(totalRaw, 10);

  if (!Number.isFinite(current) || !Number.isFinite(total)) return null;
  if (current <= 0 || total <= 0) return null;
  if (current > total) return null;
  if (total > 360) return null;

  return { current, total };
}

function findInstallmentMatch(description: string): InstallmentMatch | null {
  const source = normalizeSpaces(description ?? "");
  if (!source) return null;

  for (const pattern of INSTALLMENT_PATTERNS) {
    const match = pattern.exec(source);
    if (!match || match.index < 0) continue;
    const numbers = parseInstallmentNumbers(match[1] ?? "", match[2] ?? "");
    if (!numbers) continue;

    return {
      current: numbers.current,
      total: numbers.total,
      marker: normalizeSpaces(match[0]),
      start: match.index,
      end: match.index + match[0].length
    };
  }

  return null;
}

export function hasInstallmentMarker(description: string): boolean {
  return findInstallmentMatch(description) !== null;
}

export function stripInstallmentMarker(description: string): string {
  const source = normalizeSpaces(description ?? "");
  if (!source) return "";

  const match = findInstallmentMatch(source);
  if (!match) return source;

  const base = sanitizeBaseDescription(`${source.slice(0, match.start)} ${source.slice(match.end)}`);
  return base || source;
}

export function extractInstallmentInfo(description: string): InstallmentInfo | null {
  const source = normalizeSpaces(description ?? "");
  if (!source) return null;

  const match = findInstallmentMatch(source);
  if (!match) return null;

  const baseDescription = stripInstallmentMarker(source);

  return {
    currentInstallment: match.current,
    totalInstallments: match.total,
    remainingInstallments: Math.max(0, match.total - match.current),
    marker: `${match.current}/${match.total}`,
    baseDescription,
    normalizedBaseDescription: normalizeLikeDescription(baseDescription)
  };
}
