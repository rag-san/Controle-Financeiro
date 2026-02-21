type SimilaritySets = {
  tokenSet: Set<string>;
  trigramSet: Set<string>;
};

type KnownMerchantSource = {
  merchantKey: string;
  categoryId: string;
  weight?: number;
};

type MerchantCandidate = {
  merchantKey: string;
  categoryId: string;
  weight: number;
  tokenSet: Set<string>;
  trigramSet: Set<string>;
  lengthBucket: number;
  prefix: string;
  firstToken: string;
};

export type MerchantSimilarityIndex = {
  candidates: MerchantCandidate[];
  byFirstToken: Map<string, number[]>;
  byPrefix: Map<string, number[]>;
  byLengthBucket: Map<number, number[]>;
};

type SimilarMerchantResult = {
  merchantKey: string;
  categoryId: string;
  score: number;
};

const setsCache = new Map<string, SimilaritySets>();

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function tokenize(value: string): string[] {
  return value.split(" ").filter((token) => token.length > 0);
}

function toTrigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const grams = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }
  return grams;
}

function getSimilaritySets(value: string): SimilaritySets {
  const cached = setsCache.get(value);
  if (cached) return cached;

  const tokens = tokenize(value);
  const result: SimilaritySets = {
    tokenSet: new Set(tokens),
    trigramSet: toTrigrams(value)
  };

  setsCache.set(value, result);
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

export function scoreSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftSets = getSimilaritySets(left);
  const rightSets = getSimilaritySets(right);

  const tokenScore = jaccard(leftSets.tokenSet, rightSets.tokenSet);
  const trigramScore = jaccard(leftSets.trigramSet, rightSets.trigramSet);
  return clamp01(tokenScore * 0.55 + trigramScore * 0.45);
}

function indexPush<K>(map: Map<K, number[]>, key: K, value: number): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
}

export function buildMerchantSimilarityIndex(sources: KnownMerchantSource[]): MerchantSimilarityIndex {
  const aggregatedByMerchant = new Map<
    string,
    {
      categories: Map<string, number>;
      weight: number;
    }
  >();

  for (const source of sources) {
    const merchantKey = source.merchantKey.trim();
    const categoryId = source.categoryId.trim();
    const weight = Number.isFinite(source.weight) ? Math.max(0, source.weight ?? 1) : 1;

    if (!merchantKey || !categoryId) continue;

    const current = aggregatedByMerchant.get(merchantKey) ?? {
      categories: new Map<string, number>(),
      weight: 0
    };
    const previousCategoryWeight = current.categories.get(categoryId) ?? 0;
    current.categories.set(categoryId, previousCategoryWeight + weight);
    current.weight += weight;
    aggregatedByMerchant.set(merchantKey, current);
  }

  const candidates: MerchantCandidate[] = [];

  for (const [merchantKey, info] of aggregatedByMerchant.entries()) {
    const bestCategory = [...info.categories.entries()].sort((left, right) => right[1] - left[1])[0];
    if (!bestCategory) continue;

    const tokenSet = getSimilaritySets(merchantKey).tokenSet;
    const trigramSet = getSimilaritySets(merchantKey).trigramSet;
    const firstToken = tokenize(merchantKey)[0] ?? merchantKey.slice(0, 3);
    const prefix = merchantKey.slice(0, 3);
    const lengthBucket = Math.floor(merchantKey.length / 4);

    candidates.push({
      merchantKey,
      categoryId: bestCategory[0],
      weight: info.weight,
      tokenSet,
      trigramSet,
      firstToken,
      prefix,
      lengthBucket
    });
  }

  const byFirstToken = new Map<string, number[]>();
  const byPrefix = new Map<string, number[]>();
  const byLengthBucket = new Map<number, number[]>();

  candidates.forEach((candidate, index) => {
    indexPush(byFirstToken, candidate.firstToken, index);
    indexPush(byPrefix, candidate.prefix, index);
    indexPush(byLengthBucket, candidate.lengthBucket, index);
  });

  return {
    candidates,
    byFirstToken,
    byPrefix,
    byLengthBucket
  };
}

function scoreWithSets(querySets: SimilaritySets, candidate: MerchantCandidate): number {
  const tokenScore = jaccard(querySets.tokenSet, candidate.tokenSet);
  const trigramScore = jaccard(querySets.trigramSet, candidate.trigramSet);
  return clamp01(tokenScore * 0.55 + trigramScore * 0.45);
}

export function findMostSimilarMerchant(
  merchantKey: string,
  index: MerchantSimilarityIndex,
  options?: { minScore?: number; maxCandidates?: number }
): SimilarMerchantResult | null {
  if (!merchantKey || index.candidates.length === 0) {
    return null;
  }

  const minScore = options?.minScore ?? 0.55;
  const maxCandidates = options?.maxCandidates ?? 120;

  const firstToken = tokenize(merchantKey)[0] ?? merchantKey.slice(0, 3);
  const prefix = merchantKey.slice(0, 3);
  const lengthBucket = Math.floor(merchantKey.length / 4);

  const candidateIndexes = new Set<number>();
  for (const idx of index.byFirstToken.get(firstToken) ?? []) candidateIndexes.add(idx);
  for (const idx of index.byPrefix.get(prefix) ?? []) candidateIndexes.add(idx);
  for (const idx of index.byLengthBucket.get(lengthBucket) ?? []) candidateIndexes.add(idx);

  if (candidateIndexes.size === 0) {
    return null;
  }

  const limitedIndexes = [...candidateIndexes].slice(0, maxCandidates);
  const querySets = getSimilaritySets(merchantKey);

  let best: SimilarMerchantResult | null = null;

  for (const indexPosition of limitedIndexes) {
    const candidate = index.candidates[indexPosition];
    if (!candidate || candidate.merchantKey === merchantKey) continue;

    const similarityScore = scoreWithSets(querySets, candidate);
    if (similarityScore < minScore) continue;

    if (!best || similarityScore > best.score) {
      best = {
        merchantKey: candidate.merchantKey,
        categoryId: candidate.categoryId,
        score: Number(similarityScore.toFixed(3))
      };
    }
  }

  return best;
}
