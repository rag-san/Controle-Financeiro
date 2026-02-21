function resolveNiceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 100;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function makeNiceYAxis(
  values: number[],
  tickCount = 5
): { domain: [number, number]; ticks: number[] } {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return {
      domain: [0, 100],
      ticks: [0, 25, 50, 75, 100]
    };
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const span = maxValue - minValue;
  const paddedSpan = span === 0 ? Math.max(Math.abs(maxValue) * 0.25, 100) : span * 1.2;
  const baseStep = paddedSpan / Math.max(1, tickCount - 1);
  const step = resolveNiceStep(baseStep);

  const domainMin = Math.floor((minValue - step * 0.2) / step) * step;
  const domainMax = Math.ceil((maxValue + step * 0.2) / step) * step;
  const totalTicks = Math.max(2, Math.floor((domainMax - domainMin) / step) + 1);

  const ticks = Array.from({ length: totalTicks }, (_, index) => domainMin + index * step);

  return {
    domain: [domainMin, domainMax],
    ticks
  };
}
