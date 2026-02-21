function resolveNiceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function makeNiceYAxis(
  values: number[],
  tickCount = 5
): { domain: [number, number]; ticks: number[] } {
  const safeTickCount = Math.max(2, Math.floor(tickCount));
  const maxValue = values.reduce((max, value) => {
    if (!Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);

  if (maxValue <= 0) {
    return {
      domain: [0, 100],
      ticks: [0, 25, 50, 75, 100]
    };
  }

  const rawStep = maxValue / (safeTickCount - 1);
  const step = resolveNiceStep(rawStep);
  const niceMax = Math.ceil(maxValue / step) * step;
  const tickTotal = Math.floor(niceMax / step) + 1;
  const ticks = Array.from({ length: tickTotal }, (_, index) =>
    Number((index * step).toFixed(2))
  );

  return {
    domain: [0, Number(niceMax.toFixed(2))],
    ticks
  };
}
