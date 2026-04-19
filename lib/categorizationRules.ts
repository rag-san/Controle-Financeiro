export type RuleMatchType = "contains" | "regex";

export type CategorizationRule = {
  id: string;
  userId: string;
  name: string;
  priority: number;
  enabled: boolean;
  matchType: RuleMatchType;
  pattern: string;
  accountId?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  categoryId: string;
};

export type RuleCandidate = {
  description: string;
  normalizedDescription: string;
  amount: number;
  accountId?: string | null;
};

function normalizeRuleText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedPattern(haystack: string, pattern: string): boolean {
  const normalizedHaystack = ` ${normalizeRuleText(haystack)} `;
  const normalizedPattern = normalizeRuleText(pattern);
  if (!normalizedPattern) return false;

  if (normalizedPattern.includes(" ")) {
    return normalizedHaystack.includes(` ${normalizedPattern} `);
  }

  if (normalizedPattern.length <= 3) {
    return new RegExp(`(^|\\s)${escapeRegex(normalizedPattern)}(?=\\s|$)`).test(normalizedHaystack);
  }

  return new RegExp(`(^|\\s)${escapeRegex(normalizedPattern)}[A-Z0-9]*(?=\\s|$)`).test(normalizedHaystack);
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function matchesRule(rule: CategorizationRule, candidate: RuleCandidate): boolean {
  if (!rule.enabled) return false;

  if (rule.accountId && candidate.accountId && rule.accountId !== candidate.accountId) {
    return false;
  }

  const absoluteAmount = Math.abs(candidate.amount);
  if (rule.minAmount !== null && rule.minAmount !== undefined && absoluteAmount < rule.minAmount) {
    return false;
  }

  if (rule.maxAmount !== null && rule.maxAmount !== undefined && absoluteAmount > rule.maxAmount) {
    return false;
  }

  if (rule.matchType === "contains") {
    return containsNormalizedPattern(candidate.normalizedDescription, rule.pattern);
  }

  const regex = safeRegex(rule.pattern);
  if (!regex) return false;

  return regex.test(candidate.description) || regex.test(candidate.normalizedDescription);
}

export function resolveRuleCategory(
  rules: CategorizationRule[],
  candidate: RuleCandidate
): string | null {
  const orderedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const firstMatch = orderedRules.find((rule) => matchesRule(rule, candidate));
  return firstMatch?.categoryId ?? null;
}
